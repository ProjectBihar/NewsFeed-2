-- A reader preference affects only the timeline, never archival admission/RLS.
BEGIN;
ALTER TABLE public.articles ADD COLUMN timeline_excluded boolean NOT NULL DEFAULT false;
ALTER TABLE public.articles ADD COLUMN timeline_reason text;
COMMENT ON COLUMN public.articles.timeline_excluded IS 'Routine crime is hidden from the main timeline; public-interest exceptions remain. Archive eligibility is unchanged.';
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('GRANT SELECT (timeline_excluded) ON public.articles TO %I',role_name);
    END IF;
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.public_timeline(p_page integer DEFAULT 1, p_as_of timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  WITH clock AS (
    SELECT CASE WHEN p_as_of >= date_trunc('day',now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
      AND p_as_of <= now() THEN p_as_of ELSE now() END AS snapshot,
      (date_trunc('day',now() AT TIME ZONE 'Asia/Kolkata')-interval '6 days') AT TIME ZONE 'Asia/Kolkata' AS cutoff
  ), reports AS (
    SELECT sa.story_id,a.id,a.source_id,a.language,a.published_at,a.headline,
      COALESCE(a.published_at,a.first_seen_at) AS report_at
    FROM public.story_articles sa JOIN public.articles a ON a.id=sa.article_id
      JOIN public.sources src ON src.id=a.source_id CROSS JOIN clock c
    WHERE src.active AND NOT a.timeline_excluded AND a.article_type IS DISTINCT FROM 'advertorial'
      AND a.created_at<=c.snapshot AND sa.created_at<=c.snapshot
      AND COALESCE(a.published_at,a.first_seen_at)<=c.snapshot
  ), grouped AS (
    SELECT story_id,min(report_at) AS first_report,max(report_at) AS latest_report,
      count(*)::integer AS article_count,count(DISTINCT source_id)::integer AS source_count,
      array_agg(DISTINCT upper(language)) FILTER (WHERE language IS NOT NULL) AS languages,
      (array_agg(published_at IS NOT NULL ORDER BY report_at DESC,id DESC))[1] AS date_verified,
      (array_agg(headline ORDER BY report_at DESC,id DESC))[1] AS eligible_headline
    FROM reports GROUP BY story_id
  ), eligible AS (
    SELECT s.id,CASE WHEN EXISTS (SELECT 1 FROM public.story_articles sa JOIN public.articles a ON a.id=sa.article_id
      WHERE sa.story_id=s.id AND a.timeline_excluded) THEN g.eligible_headline ELSE s.canonical_title END AS canonical_title,s.primary_category,s.event_type,s.district_id,
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
NOTIFY pgrst,'reload schema';
COMMIT;
