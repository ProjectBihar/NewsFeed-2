-- One public feed. Importance/category inference does not gate publication.
BEGIN;
ALTER POLICY public_articles ON public.articles USING (
  bihar_relevance_score >= 0.5
  AND article_type IS DISTINCT FROM 'advertorial'
  AND extraction_confidence IS DISTINCT FROM 'failed'
  AND EXISTS (SELECT 1 FROM public.sources src WHERE src.id = source_id)
);

CREATE OR REPLACE FUNCTION public.recount_story_metadata(p_story_id bigint) RETURNS void
LANGUAGE sql SET search_path = public, pg_temp AS $$
  UPDATE public.stories SET
    primary_category=(SELECT a.primary_category FROM public.articles a JOIN public.sources s ON s.id=a.source_id
      WHERE a.story_id=p_story_id AND s.active AND a.bihar_relevance_score>=0.5
      AND a.article_type IS DISTINCT FROM 'advertorial' AND a.primary_category IS NOT NULL
      GROUP BY a.primary_category ORDER BY count(*) DESC,a.primary_category LIMIT 1),
    event_type=(SELECT a.event_type FROM public.articles a JOIN public.sources s ON s.id=a.source_id
      WHERE a.story_id=p_story_id AND s.active AND a.bihar_relevance_score>=0.5
      AND a.article_type IS DISTINCT FROM 'advertorial' AND a.event_type IS NOT NULL
      GROUP BY a.event_type ORDER BY count(*) DESC,a.event_type LIMIT 1),
    district_id=(SELECT CASE WHEN count(DISTINCT a.district_id)=1 THEN min(a.district_id) ELSE NULL END
      FROM public.articles a JOIN public.sources s ON s.id=a.source_id WHERE a.story_id=p_story_id AND s.active
      AND a.bihar_relevance_score>=0.5 AND a.article_type IS DISTINCT FROM 'advertorial'),
    article_count=(SELECT count(*) FROM public.articles a JOIN public.sources s ON s.id=a.source_id
      WHERE a.story_id=p_story_id AND s.active AND a.bihar_relevance_score>=0.5
      AND a.article_type IS DISTINCT FROM 'advertorial'),
    source_count=(SELECT count(DISTINCT a.source_id) FROM public.articles a JOIN public.sources s ON s.id=a.source_id
      WHERE a.story_id=p_story_id AND s.active AND a.bihar_relevance_score>=0.5
      AND a.article_type IS DISTINCT FROM 'advertorial'),
    first_seen_at=COALESCE((SELECT min(COALESCE(published_at,first_seen_at)) FROM public.articles WHERE story_id=p_story_id),first_seen_at),
    last_seen_at=COALESCE((SELECT max(COALESCE(published_at,first_seen_at)) FROM public.articles WHERE story_id=p_story_id),last_seen_at)
  WHERE id=p_story_id;
$$;

-- Snapshot visibility needs insertion time, not a crawl/discovery timestamp.
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('GRANT SELECT (created_at) ON public.articles TO %I',role_name);
      EXECUTE format('GRANT SELECT (created_at) ON public.story_articles TO %I',role_name);
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION public.public_timeline(p_page integer DEFAULT 1, p_as_of timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  WITH clock AS (
    SELECT CASE WHEN p_as_of >= date_trunc('day',now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
      AND p_as_of <= now() THEN p_as_of ELSE now() END AS snapshot,
      (date_trunc('day',now() AT TIME ZONE 'Asia/Kolkata')-interval '6 days') AT TIME ZONE 'Asia/Kolkata' AS cutoff
  ), reports AS (
    SELECT sa.story_id,a.id,a.source_id,a.language,a.published_at,
      COALESCE(a.published_at,a.first_seen_at) AS report_at
    FROM public.story_articles sa JOIN public.articles a ON a.id=sa.article_id
      JOIN public.sources src ON src.id=a.source_id CROSS JOIN clock c
    WHERE src.active AND a.article_type IS DISTINCT FROM 'advertorial'
      AND a.created_at<=c.snapshot AND sa.created_at<=c.snapshot
      AND COALESCE(a.published_at,a.first_seen_at)<=c.snapshot
  ), grouped AS (
    SELECT story_id,min(report_at) AS first_report,max(report_at) AS latest_report,
      count(*)::integer AS article_count,count(DISTINCT source_id)::integer AS source_count,
      array_agg(DISTINCT upper(language)) FILTER (WHERE language IS NOT NULL) AS languages,
      (array_agg(published_at IS NOT NULL ORDER BY report_at DESC,id DESC))[1] AS date_verified
    FROM reports GROUP BY story_id
  ), eligible AS (
    SELECT s.id,s.canonical_title,s.primary_category,s.event_type,s.district_id,
      g.article_count,g.source_count,g.first_report AS first_seen_at,g.latest_report AS last_seen_at,
      COALESCE(g.languages,ARRAY[]::text[]) AS languages,g.date_verified
    FROM public.stories s JOIN grouped g ON g.story_id=s.id CROSS JOIN clock c
    WHERE s.status='active' AND g.latest_report>=c.cutoff
  ), counts AS (
    SELECT count(*) AS total,GREATEST(1,ceil(count(*)/90.0)::integer) AS pages FROM eligible
  ), pagination AS (
    SELECT total,pages,LEAST(GREATEST(COALESCE(p_page,1),1),pages) AS page FROM counts
  ), page_rows AS (
    SELECT * FROM eligible ORDER BY last_seen_at DESC,id DESC
    LIMIT 90 OFFSET (SELECT (page::bigint-1)*90 FROM pagination)
  )
  SELECT jsonb_build_object('stories',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.last_seen_at DESC,r.id DESC) FROM page_rows r),'[]'::jsonb),
    'total',p.total,'page',p.page,'totalPages',p.pages,'asOf',c.snapshot,'start',c.cutoff)
  FROM pagination p CROSS JOIN clock c;
$$;
REVOKE ALL ON FUNCTION public.public_timeline(integer,timestamptz) FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.public_timeline(integer,timestamptz) TO %I',role_name);
    END IF;
  END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS idx_articles_story_created ON public.articles(story_id,created_at);
-- Repair cached counts for newly eligible report types; archives retain all metadata.
SELECT public.recount_story_metadata(id) FROM public.stories;
NOTIFY pgrst,'reload schema';
COMMIT;
