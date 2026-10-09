-- Public readers may read eligible permanent metadata only. Admin and
-- processing use the server-only service role. This migration is additive
-- to the versioned schema; it does not delete or reclassify existing rows.
BEGIN;

DO $$
DECLARE
  v_table text;
  role_name text;
  sequence_name text;
  tables text[] := ARRAY[
    'sources', 'source_endpoints', 'crawl_runs', 'crawl_queue', 'articles',
    'stories', 'story_articles', 'entities', 'entity_aliases', 'article_entities',
    'source_health', 'classification_results', 'admin_corrections', 'temp_documents'
  ];
BEGIN
  FOREACH v_table IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', v_table);
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', v_table, role_name);
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', v_table);
    END IF;
    sequence_name := NULL;
    -- Join tables have no identity column.
    IF EXISTS (SELECT 1 FROM information_schema.columns c
               WHERE c.table_schema = 'public' AND c.table_name = v_table AND c.column_name = 'id') THEN
      sequence_name := pg_get_serial_sequence(format('public.%I', v_table), 'id');
    END IF;
    IF sequence_name IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC', sequence_name);
      FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM %I', sequence_name, role_name);
        END IF;
      END LOOP;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE format('GRANT ALL ON SEQUENCE %s TO service_role', sequence_name);
      END IF;
    END IF;
  END LOOP;
END;
$$;

CREATE POLICY public_sources ON public.sources FOR SELECT
  USING (active = true);

-- Only classified, Bihar-relevant publications belong to the public corpus.
-- These four types have tier D in classification/classifier.py. Curated is
-- a separate, narrower selection; ordinary tier C reporting remains readable.
CREATE POLICY public_articles ON public.articles FOR SELECT
  USING (
    bihar_relevance_score >= 0.5
    AND article_type IS NOT NULL
    AND article_type NOT IN ('roundup', 'sports', 'entertainment', 'advertorial')
    AND EXISTS (SELECT 1 FROM public.sources src WHERE src.id = source_id)
  );

CREATE POLICY public_story_articles ON public.story_articles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.articles a WHERE a.id = article_id));

CREATE POLICY public_stories ON public.stories FOR SELECT
  USING (
    status = 'active'
    AND EXISTS (SELECT 1 FROM public.story_articles sa WHERE sa.story_id = stories.id)
  );

CREATE POLICY public_article_entities ON public.article_entities FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.articles a WHERE a.id = article_id));

CREATE POLICY public_entities ON public.entities FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.article_entities ae WHERE ae.entity_id = entities.id));

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', role_name);
      -- Column grants deliberately exclude source diagnostics and article
      -- fingerprints/confidence. PostgREST embeds use the same grants/RLS.
      EXECUTE format('GRANT SELECT (id, name, domain, language, scope, source_type, active) ON public.sources TO %I', role_name);
      EXECUTE format('GRANT SELECT (id, source_id, url, canonical_url, headline, description, language, published_at, first_seen_at, last_seen_at, article_type, primary_category, event_type, district_id, story_id, curated) ON public.articles TO %I', role_name);
      EXECUTE format('GRANT SELECT ON public.stories TO %I', role_name);
      EXECUTE format('GRANT SELECT (story_id, article_id) ON public.story_articles TO %I', role_name);
      EXECUTE format('GRANT SELECT (article_id, entity_id) ON public.article_entities TO %I', role_name);
      EXECUTE format('GRANT SELECT (id, canonical_name) ON public.entities TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;

-- SECURITY INVOKER search obeys the caller's row and column permissions.
-- Cleanup is privileged even though it only deletes temporary rows.
REVOKE ALL ON FUNCTION public.run_retention_cleanup() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_story_ids(text[], text, text, text, text, text, text, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_norm(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_token_pattern(text) FROM PUBLIC;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.run_retention_cleanup() FROM %I', role_name);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.search_story_ids(text[], text, text, text, text, text, text, integer, integer, integer), public.search_norm(text), public.search_token_pattern(text) TO %I', role_name);
      IF role_name = 'service_role' THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.run_retention_cleanup() TO service_role';
      END IF;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
