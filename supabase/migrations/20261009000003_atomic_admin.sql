-- Service-only admin RPC. Each operation and its audit trail commit together.
BEGIN;

CREATE FUNCTION public.recount_story_metadata(p_story_id bigint) RETURNS void
LANGUAGE sql SET search_path = public, pg_temp AS $$
  UPDATE public.stories SET
    primary_category=(SELECT a.primary_category FROM public.articles a JOIN public.sources s ON s.id=a.source_id
      WHERE a.story_id=p_story_id AND s.active AND a.bihar_relevance_score>=0.5
      AND a.article_type NOT IN ('roundup','sports','entertainment','advertorial') AND a.primary_category IS NOT NULL
      GROUP BY a.primary_category ORDER BY count(*) DESC,a.primary_category LIMIT 1),
    event_type=(SELECT a.event_type FROM public.articles a JOIN public.sources s ON s.id=a.source_id
      WHERE a.story_id=p_story_id AND s.active AND a.bihar_relevance_score>=0.5
      AND a.article_type NOT IN ('roundup','sports','entertainment','advertorial') AND a.event_type IS NOT NULL
      GROUP BY a.event_type ORDER BY count(*) DESC,a.event_type LIMIT 1),
    district_id=(SELECT CASE WHEN count(DISTINCT a.district_id)=1 THEN min(a.district_id) ELSE NULL END
      FROM public.articles a JOIN public.sources s ON s.id=a.source_id WHERE a.story_id=p_story_id AND s.active
      AND a.bihar_relevance_score>=0.5 AND a.article_type NOT IN ('roundup','sports','entertainment','advertorial')),
    article_count=(SELECT count(*) FROM public.articles a JOIN public.sources s ON s.id=a.source_id
      WHERE a.story_id=p_story_id AND s.active AND a.bihar_relevance_score>=0.5
      AND a.article_type IS NOT NULL AND a.article_type NOT IN ('roundup','sports','entertainment','advertorial')),
    source_count=(SELECT count(DISTINCT a.source_id) FROM public.articles a JOIN public.sources s ON s.id=a.source_id
      WHERE a.story_id=p_story_id AND s.active AND a.bihar_relevance_score>=0.5
      AND a.article_type IS NOT NULL AND a.article_type NOT IN ('roundup','sports','entertainment','advertorial')),
    first_seen_at=COALESCE((SELECT min(COALESCE(published_at,first_seen_at)) FROM public.articles WHERE story_id=p_story_id),first_seen_at),
    last_seen_at=COALESCE((SELECT max(COALESCE(published_at,first_seen_at)) FROM public.articles WHERE story_id=p_story_id),last_seen_at)
  WHERE id=p_story_id;
$$;

CREATE FUNCTION public.admin_mutate(
  p_operation text, p_id bigint, p_target bigint DEFAULT NULL,
  p_title text DEFAULT NULL, p_fields jsonb DEFAULT '{}'::jsonb,
  p_article_ids bigint[] DEFAULT ARRAY[]::bigint[], p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_article public.articles%ROWTYPE;
  v_story public.stories%ROWTYPE;
  v_id bigint; v_target bigint; v_from bigint; v_members bigint[];
  v_field text; v_old text; v_new text; v_version text;
  v_count integer:=0; v_updated text[]:=ARRAY[]::text[];
  v_names text[]; v_previous text[]; v_name text; v_entity bigint;
BEGIN
  IF p_id IS NULL OR p_id<1 THEN RAISE EXCEPTION 'Invalid identifier'; END IF;
  IF p_operation='merge' AND p_target IS NULL THEN RAISE EXCEPTION 'Merge target is required'; END IF;
  -- Same lock as ingestion: membership and title choices cannot race.
  PERFORM pg_advisory_xact_lock(20261009);
  p_reason:=NULLIF(btrim(p_reason),'');
  p_title:=NULLIF(regexp_replace(btrim(p_title),'\s+',' ','g'),'');
  IF p_title IS NOT NULL AND length(p_title)>300 THEN RAISE EXCEPTION 'Title too long'; END IF;

  IF p_operation='correct' THEN
    SELECT * INTO v_article FROM public.articles WHERE id=p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Article not found'; END IF;
    SELECT classifier_version INTO v_version FROM public.classification_results
      WHERE article_id=p_id ORDER BY created_at DESC,id DESC LIMIT 1;
    v_version:=COALESCE(v_version,'unclassified');
    FOREACH v_field IN ARRAY ARRAY['article_type','primary_category','event_type','district_id','bihar_relevant'] LOOP
      v_new:=NULLIF(p_fields->>v_field,'');
      IF v_new IS NULL THEN CONTINUE; END IF;
      IF v_field='bihar_relevant' THEN
        IF v_new NOT IN ('true','false') THEN RAISE EXCEPTION 'Invalid relevance value'; END IF;
        v_new:=CASE WHEN v_new='true' THEN '1' ELSE '0' END;
        v_old:=v_article.bihar_relevance_score::text;
        IF v_article.bihar_relevance_score IS NOT DISTINCT FROM v_new::double precision THEN CONTINUE; END IF;
        UPDATE public.articles SET bihar_relevance_score=v_new::double precision WHERE id=p_id;
        v_updated:=array_append(v_updated,'bihar_relevance_score');
        v_field:='bihar_relevance';
      ELSE
        v_old:=to_jsonb(v_article)->>v_field;
        IF v_old IS NOT DISTINCT FROM v_new THEN CONTINUE; END IF;
        -- Identifier comes exclusively from the fixed whitelist above.
        EXECUTE format('UPDATE public.articles SET %I=$1 WHERE id=$2',v_field) USING v_new,p_id;
        v_updated:=array_append(v_updated,v_field);
      END IF;
      INSERT INTO public.admin_corrections(article_id,story_id,field_name,old_value,new_value,reason,classifier_version)
        VALUES(p_id,v_article.story_id,v_field,v_old,v_new,p_reason,v_version);
      v_count:=v_count+1;
    END LOOP;
    IF p_fields ? 'entities' THEN
      SELECT COALESCE(array_agg(DISTINCT btrim(name) ORDER BY btrim(name)),ARRAY[]::text[]) INTO v_names
        FROM unnest(string_to_array(p_fields->>'entities',',')) AS name WHERE btrim(name)<>'';
      SELECT COALESCE(array_agg(e.canonical_name ORDER BY e.canonical_name),ARRAY[]::text[]) INTO v_previous
        FROM public.article_entities ae JOIN public.entities e ON e.id=ae.entity_id WHERE ae.article_id=p_id;
      IF v_names IS DISTINCT FROM v_previous THEN
        DELETE FROM public.article_entities WHERE article_id=p_id;
        FOREACH v_name IN ARRAY v_names LOOP
          INSERT INTO public.entities(canonical_name,entity_type) VALUES(v_name,'manual')
            ON CONFLICT(canonical_name) DO UPDATE SET canonical_name=EXCLUDED.canonical_name RETURNING id INTO v_entity;
          INSERT INTO public.article_entities(article_id,entity_id,confidence,evidence)
            VALUES(p_id,v_entity,1,'["admin-correction"]'::jsonb);
        END LOOP;
        INSERT INTO public.admin_corrections(article_id,story_id,field_name,old_value,new_value,reason,classifier_version)
          VALUES(p_id,v_article.story_id,'entities',to_jsonb(v_previous)::text,to_jsonb(v_names)::text,p_reason,v_version);
        v_count:=v_count+1;
        v_updated:=array_append(v_updated,'entities');
      END IF;
    END IF;
    PERFORM public.recount_story_metadata(v_article.story_id);
    RETURN jsonb_build_object('updatedFields',v_updated,'corrections',v_count);
  END IF;

  IF p_operation='move' THEN
    SELECT * INTO v_article FROM public.articles WHERE id=p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Article not found'; END IF;
    v_from:=v_article.story_id;
    v_members:=ARRAY[p_id];
  ELSE
    SELECT * INTO v_story FROM public.stories WHERE id=p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Story not found'; END IF;
    IF v_story.status<>'active' THEN RAISE EXCEPTION 'Story is not active'; END IF;
    IF p_operation='rename' THEN
      IF p_title IS NULL THEN RAISE EXCEPTION 'Title is required'; END IF;
      IF v_story.canonical_title IS DISTINCT FROM p_title THEN
        UPDATE public.stories SET canonical_title=p_title WHERE id=p_id;
        INSERT INTO public.admin_corrections(story_id,field_name,old_value,new_value,reason)
          VALUES(p_id,'canonical_title',v_story.canonical_title,p_title,p_reason);
      END IF;
      RETURN '{}'::jsonb;
    END IF;
    IF p_operation NOT IN ('merge','split') THEN RAISE EXCEPTION 'Unknown admin operation'; END IF;
    v_from:=p_id;
    SELECT COALESCE(array_agg(id ORDER BY id),ARRAY[]::bigint[]) INTO v_members FROM public.articles WHERE story_id=p_id;
    IF p_operation='split' THEN
      IF cardinality(p_article_ids)=0 OR NOT p_article_ids<@v_members THEN RAISE EXCEPTION 'Invalid split selection'; END IF;
      SELECT array_agg(DISTINCT id ORDER BY id) INTO v_members FROM unnest(p_article_ids) id;
      IF cardinality(v_members)>=(SELECT count(*) FROM public.articles WHERE story_id=p_id) THEN
        RAISE EXCEPTION 'At least one member must remain';
      END IF;
      p_target:=NULL;
    END IF;
  END IF;
  IF p_target IS NULL THEN
    IF p_title IS NULL THEN RAISE EXCEPTION 'Title is required'; END IF;
    INSERT INTO public.stories(canonical_title,primary_category,event_type,district_id)
      VALUES(p_title,COALESCE(v_article.primary_category,v_story.primary_category),
        COALESCE(v_article.event_type,v_story.event_type),COALESCE(v_article.district_id,v_story.district_id)) RETURNING id INTO v_target;
    -- Manual new titles must survive later ingestion title selection.
    INSERT INTO public.admin_corrections(story_id,field_name,new_value,reason)
      VALUES(v_target,'canonical_title',p_title,p_reason);
  ELSE
    IF p_target<1 OR (p_operation='merge' AND p_target=p_id) THEN RAISE EXCEPTION 'Invalid target'; END IF;
    PERFORM id FROM public.stories WHERE id=p_target AND status='active' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Active target story not found'; END IF;
    v_target:=p_target;
  END IF;
  IF p_operation='move' AND v_from=v_target THEN RETURN jsonb_build_object('storyId',v_target); END IF;
  FOREACH v_id IN ARRAY v_members LOOP
    INSERT INTO public.story_articles(story_id,article_id,cluster_score) VALUES(v_target,v_id,NULL)
      ON CONFLICT(article_id) DO UPDATE SET story_id=EXCLUDED.story_id,cluster_score=NULL;
    UPDATE public.articles SET story_id=v_target WHERE id=v_id;
    INSERT INTO public.admin_corrections(article_id,story_id,field_name,old_value,new_value,reason)
      VALUES(v_id,v_target,'story_assignment',v_from::text,v_target::text,p_reason);
  END LOOP;
  IF p_operation='merge' THEN
    UPDATE public.stories SET status='merged' WHERE id=p_id;
    INSERT INTO public.admin_corrections(story_id,field_name,old_value,new_value,reason)
      VALUES(p_id,'status',v_story.status,'merged',p_reason);
  END IF;
  PERFORM public.recount_story_metadata(v_from);
  PERFORM public.recount_story_metadata(v_target);
  IF p_operation='merge' THEN RETURN jsonb_build_object('moved',cardinality(v_members)); END IF;
  RETURN jsonb_build_object('storyId',v_target);
END;
$$;

REVOKE ALL ON FUNCTION public.recount_story_metadata(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_mutate(text,bigint,bigint,text,jsonb,bigint[],text) FROM PUBLIC;
DO $$ DECLARE v_role text; BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=v_role) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.recount_story_metadata(bigint) FROM %I',v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.admin_mutate(text,bigint,bigint,text,jsonb,bigint[],text) FROM %I',v_role);
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT EXECUTE ON FUNCTION public.recount_story_metadata(bigint) TO service_role;
    GRANT EXECUTE ON FUNCTION public.admin_mutate(text,bigint,bigint,text,jsonb,bigint[],text) TO service_role;
  END IF;
END $$;
COMMIT;
