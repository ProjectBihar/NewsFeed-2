-- ProjectBihar Newsfeed V2 — Phase 2: Database Foundation.
--
-- Creates the canonical data model from scratch. A blank PostgreSQL/Supabase
-- database must be reproducible by applying every file in
-- supabase/migrations/ in lexicographic order:
--
--   psql "$DATABASE_URL" -f supabase/migrations/20260928000001_phase2_foundation.sql
--
-- Design notes:
-- * Primary keys are BIGINT identity columns. No extensions required, so the
--   migration applies to stock PostgreSQL, Supabase, and embedded PGlite.
-- * Controlled vocabularies that must stay extensible use TEXT + CHECK
--   (never Postgres ENUM), so new values arrive via migration, not rewrite.
-- * Taxonomies owned by later phases (article_type, primary_category,
--   event_type) are unconstrained TEXT here; Phases 11-13 add benchmarks,
--   not schema locks.
-- * district_id is a TEXT slug. No districts table exists in Phase 2; the
--   reference geography lands in Phase 9 (data/geography/).
-- * articles.headline_hash is additional to the Section 11 column list and
--   exists for Phase 14 exact dedup ("normalised headline hash").
-- * Full article bodies are NOT stored here. Per retention policy they live
--   in temporary storage only (Phase 35); this schema keeps metadata,
--   hashes, fingerprints, entities, classification, and story links.

-- updated_at helper -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- sources ---------------------------------------------------------------------
CREATE TABLE public.sources (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL,
  scope TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'news'
    CHECK (source_type IN ('news', 'official', 'research', 'institutional')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('high', 'medium', 'low')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sources IS 'Canonical source registry (Phase 3 owns rows, Phase 2 owns shape).';
COMMENT ON COLUMN public.sources.scope IS 'Coverage scope, e.g. national, bihar, district. Vocabulary evolves in Phase 3.';

-- source_endpoints --------------------------------------------------------------
CREATE TABLE public.source_endpoints (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES public.sources (id) ON DELETE CASCADE,
  endpoint_type TEXT NOT NULL
    CHECK (endpoint_type IN ('rss', 'atom', 'news_sitemap', 'sitemap', 'wordpress_api', 'section')),
  url TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('high', 'medium', 'low')),
  last_checked TIMESTAMPTZ,
  last_seen_url TEXT,
  last_seen_published_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.source_endpoints IS 'Discovery channels per source with checkpoints (Phase 4 moves the cursor).';

-- crawl_runs --------------------------------------------------------------------
CREATE TABLE public.crawl_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'complete', 'failed', 'cancelled')),
  sources_attempted INTEGER NOT NULL DEFAULT 0 CHECK (sources_attempted >= 0),
  sources_succeeded INTEGER NOT NULL DEFAULT 0 CHECK (sources_succeeded >= 0),
  urls_discovered INTEGER NOT NULL DEFAULT 0 CHECK (urls_discovered >= 0),
  urls_fetched INTEGER NOT NULL DEFAULT 0 CHECK (urls_fetched >= 0),
  articles_extracted INTEGER NOT NULL DEFAULT 0 CHECK (articles_extracted >= 0),
  articles_relevant INTEGER NOT NULL DEFAULT 0 CHECK (articles_relevant >= 0),
  stories_created INTEGER NOT NULL DEFAULT 0 CHECK (stories_created >= 0),
  errors INTEGER NOT NULL DEFAULT 0 CHECK (errors >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.crawl_runs IS 'Durable audit record for every crawl run.';

-- crawl_queue -------------------------------------------------------------------
CREATE TABLE public.crawl_queue (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  url TEXT NOT NULL,
  canonical_url TEXT NOT NULL UNIQUE,
  source_id BIGINT REFERENCES public.sources (id) ON DELETE SET NULL,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  discovery_method TEXT,
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'discovered'
    CHECK (status IN ('discovered', 'queued', 'fetching', 'fetched', 'extracted',
                      'rejected', 'retry', 'failed', 'blocked', 'complete')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_retry_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.crawl_queue IS 'Persistent request queue. Must survive crash/cancellation (Phase 5).';

-- stories -----------------------------------------------------------------------
CREATE TABLE public.stories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  canonical_title TEXT NOT NULL,
  primary_category TEXT,
  event_type TEXT,
  district_id TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  article_count INTEGER NOT NULL DEFAULT 0 CHECK (article_count >= 0),
  source_count INTEGER NOT NULL DEFAULT 0 CHECK (source_count >= 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'merged', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stories IS 'Real-world developments. Core public unit; articles attach via story_articles.';

-- articles ----------------------------------------------------------------------
CREATE TABLE public.articles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES public.sources (id) ON DELETE RESTRICT,
  url TEXT NOT NULL,
  canonical_url TEXT NOT NULL UNIQUE,
  headline TEXT NOT NULL,
  headline_hash TEXT,
  description TEXT,
  language TEXT,
  language_confidence DOUBLE PRECISION CHECK (language_confidence IS NULL OR (language_confidence >= 0 AND language_confidence <= 1)),
  script_mix TEXT,
  published_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  content_hash TEXT,
  similarity_fingerprint TEXT,
  extraction_confidence TEXT CHECK (extraction_confidence IS NULL OR extraction_confidence IN ('high', 'medium', 'low', 'failed')),
  bihar_relevance_score DOUBLE PRECISION CHECK (bihar_relevance_score IS NULL OR (bihar_relevance_score >= 0 AND bihar_relevance_score <= 1)),
  article_type TEXT,
  primary_category TEXT,
  event_type TEXT,
  district_id TEXT,
  story_id BIGINT REFERENCES public.stories (id) ON DELETE SET NULL,
  curated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.articles IS 'Publisher publications. Never republish full bodies publicly (copyright boundary).';
COMMENT ON COLUMN public.articles.headline_hash IS 'Normalised headline hash for Phase 14 exact dedup.';

-- story_articles ------------------------------------------------------------------
CREATE TABLE public.story_articles (
  story_id BIGINT NOT NULL REFERENCES public.stories (id) ON DELETE CASCADE,
  article_id BIGINT NOT NULL REFERENCES public.articles (id) ON DELETE CASCADE,
  cluster_score DOUBLE PRECISION CHECK (cluster_score IS NULL OR (cluster_score >= 0 AND cluster_score <= 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, article_id),
  UNIQUE (article_id)
);

COMMENT ON TABLE public.story_articles IS 'Story membership. One article belongs to at most one story.';

-- entities ----------------------------------------------------------------------
CREATE TABLE public.entities (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,
  district_id TEXT,
  latitude DOUBLE PRECISION CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  longitude DOUBLE PRECISION CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  parent_entity_id BIGINT REFERENCES public.entities (id) ON DELETE SET NULL,
  valid_from DATE,
  valid_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

COMMENT ON TABLE public.entities IS 'Canonical Bihar knowledge entities. Alias rows live in entity_aliases.';

-- entity_aliases ------------------------------------------------------------------
CREATE TABLE public.entity_aliases (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id BIGINT NOT NULL REFERENCES public.entities (id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  language TEXT,
  alias_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_id, alias, language)
);

COMMENT ON TABLE public.entity_aliases IS 'Alias surface forms. No global alias uniqueness: ambiguity must be representable.';

-- article_entities ------------------------------------------------------------------
CREATE TABLE public.article_entities (
  article_id BIGINT NOT NULL REFERENCES public.articles (id) ON DELETE CASCADE,
  entity_id BIGINT NOT NULL REFERENCES public.entities (id) ON DELETE CASCADE,
  confidence DOUBLE PRECISION CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, entity_id)
);

-- source_health ---------------------------------------------------------------------
CREATE TABLE public.source_health (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES public.sources (id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fetch_success_rate DOUBLE PRECISION CHECK (fetch_success_rate IS NULL OR (fetch_success_rate >= 0 AND fetch_success_rate <= 1)),
  extraction_success_rate DOUBLE PRECISION CHECK (extraction_success_rate IS NULL OR (extraction_success_rate >= 0 AND extraction_success_rate <= 1)),
  articles_discovered INTEGER NOT NULL DEFAULT 0 CHECK (articles_discovered >= 0),
  http_403_count INTEGER NOT NULL DEFAULT 0 CHECK (http_403_count >= 0),
  http_429_count INTEGER NOT NULL DEFAULT 0 CHECK (http_429_count >= 0),
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  health_state TEXT CHECK (health_state IS NULL OR health_state IN ('HEALTHY', 'DEGRADED', 'BROKEN', 'STALE', 'BLOCKED')),
  diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.source_health IS 'One row per check. Current state is the latest row per source.';

-- classification_results ------------------------------------------------------------------
CREATE TABLE public.classification_results (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES public.articles (id) ON DELETE CASCADE,
  classifier_version TEXT NOT NULL,
  category TEXT,
  article_type TEXT,
  event_type TEXT,
  confidence DOUBLE PRECISION CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.classification_results IS 'Append-only predictions. Corrections live in admin_corrections.';

-- admin_corrections ------------------------------------------------------------------
CREATE TABLE public.admin_corrections (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  article_id BIGINT REFERENCES public.articles (id) ON DELETE SET NULL,
  story_id BIGINT REFERENCES public.stories (id) ON DELETE SET NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (article_id IS NOT NULL OR story_id IS NOT NULL)
);

COMMENT ON TABLE public.admin_corrections IS 'Durable labelled data. History is appended, never silently overwritten.';

-- indexes: feed, archive, queue, and lookup paths ---------------------------------------
CREATE INDEX idx_source_endpoints_source ON public.source_endpoints (source_id);
CREATE INDEX idx_crawl_runs_started ON public.crawl_runs (started_at DESC);
CREATE INDEX idx_crawl_queue_status_retry ON public.crawl_queue (status, next_retry_at);
CREATE INDEX idx_crawl_queue_source ON public.crawl_queue (source_id);
CREATE INDEX idx_articles_published ON public.articles (published_at DESC);
CREATE INDEX idx_articles_curated_published ON public.articles (published_at DESC) WHERE curated = TRUE;
CREATE INDEX idx_articles_category_published ON public.articles (primary_category, published_at DESC);
CREATE INDEX idx_articles_district_published ON public.articles (district_id, published_at DESC);
CREATE INDEX idx_articles_source_published ON public.articles (source_id, published_at DESC);
CREATE INDEX idx_articles_story ON public.articles (story_id);
CREATE INDEX idx_articles_content_hash ON public.articles (content_hash);
CREATE INDEX idx_articles_headline_hash ON public.articles (headline_hash);
CREATE INDEX idx_articles_relevance ON public.articles (bihar_relevance_score DESC);
CREATE INDEX idx_stories_last_seen ON public.stories (last_seen_at DESC);
CREATE INDEX idx_stories_category ON public.stories (primary_category);
CREATE INDEX idx_stories_district ON public.stories (district_id);
CREATE INDEX idx_stories_status ON public.stories (status);
CREATE INDEX idx_story_articles_story ON public.story_articles (story_id);
CREATE INDEX idx_article_entities_entity ON public.article_entities (entity_id);
CREATE INDEX idx_entities_type ON public.entities (entity_type);
CREATE INDEX idx_entities_district ON public.entities (district_id);
CREATE INDEX idx_entity_aliases_alias ON public.entity_aliases (alias, language);
CREATE INDEX idx_entity_aliases_entity ON public.entity_aliases (entity_id);
CREATE INDEX idx_source_health_source_checked ON public.source_health (source_id, checked_at DESC);
CREATE INDEX idx_classification_article ON public.classification_results (article_id);
CREATE INDEX idx_classification_version ON public.classification_results (classifier_version);
CREATE INDEX idx_corrections_article ON public.admin_corrections (article_id);
CREATE INDEX idx_corrections_story ON public.admin_corrections (story_id);

-- updated_at triggers ----------------------------------------------------------------------
CREATE TRIGGER trg_sources_updated_at BEFORE UPDATE ON public.sources
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_source_endpoints_updated_at BEFORE UPDATE ON public.source_endpoints
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_crawl_queue_updated_at BEFORE UPDATE ON public.crawl_queue
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_stories_updated_at BEFORE UPDATE ON public.stories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_articles_updated_at BEFORE UPDATE ON public.articles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_entities_updated_at BEFORE UPDATE ON public.entities
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
