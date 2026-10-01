-- ProjectBihar Newsfeed V2 — Phase 34: PostgreSQL search (no Elasticsearch).
--
-- The plan: "Provide useful archive search without introducing
-- Elasticsearch. Use PostgreSQL search capabilities first." This migration
-- adds `search_story_ids`, which executes the whole search in the database:
--
--   * Text tokens (AND semantics) across the plan's field list: story
--     titles, article titles, entities, districts, categories, sources.
--   * The plan's filters: date (year), district, category, article type,
--     event type, source, language — article-side facts resolve through the
--     story's member articles, mirroring the demo path exactly.
--   * Ranking: stories whose headline contains every token first, then
--     first-reported time (IST), then id — the same deterministic order
--     `src/lib/public/search.ts` produces in-process for the fixture.
--   * One page window: returns `{ total, ids }` — the exact count plus at
--     most `p_limit` ids (hard-capped at 100), so an archive-scale result
--     set is never shipped whole. "Do not load the entire archive into the
--     browser" holds for search too.
--
-- Evaluation is SET-BASED, not per-row correlated probes: each searchable
-- field is one whole-table scan (stories, articles, entities, sources),
-- unioned into per-token story-id hits and counted per story. The first
-- draft used correlated EXISTS chains per story row; EXPLAIN ANALYZE on the
-- 3,000-story seed showed ~61k buffer touches and ~5.5s in embedded
-- PGlite. The set-based shape scans a few hundred pages instead — the
-- archive-scale gate (tests/search-fn.test.ts) asserts a wall-clock bound
-- on exactly this query.
--
-- Matching is ILIKE substring search over `search_norm`-normalised text
-- (lowercase, -/_ folded to spaces): literal substrings work for English
-- and Devanagari alike, while a tsvector index would only serve English.
-- User tokens are LIKE-escaped (`search_token_pattern`), so `%` and `_` in
-- a query are literal characters, never wildcards. Year windows use IST
-- (+05:30) boundaries — the same bucketing as the Phase 33 archive.
-- At millions of rows this becomes a pg_trgm/FTS follow-up (documented
-- limitation); at archive scale (thousands) whole-table scans are the
-- right cost.
--
-- Phase 34 also adds two membership indexes the set-based branches probe
-- by the reverse key: `article_entities (article_id)` (the foundation only
-- indexed entity_id) and `story_articles (article_id)` (article → story).

-- Normalised haystack: lowercase with - and _ folded to spaces, so
-- "Bihar Cabinet", "bihar-cabinet" and "bihar_cabinet" are one text.
CREATE OR REPLACE FUNCTION public.search_norm(value TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT lower(replace(replace(coalesce(value, ''), '-', ' '), '_', ' '))
$$;

-- LIKE-escaped pattern for one normalised token: `%…%`, with backslash and
-- percent doubled AFTER normalisation (norm removes -/_ so no underscore
-- can be left unescaped). Default LIKE escape is backslash in PostgreSQL.
CREATE OR REPLACE FUNCTION public.search_token_pattern(token TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT '%' || replace(replace(public.search_norm(token), '\', '\\'), '%', '\%') || '%'
$$;

CREATE OR REPLACE FUNCTION public.search_story_ids(
  p_tokens TEXT[] DEFAULT NULL,
  p_district TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_event_type TEXT DEFAULT NULL,
  p_article_type TEXT DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_language TEXT DEFAULT NULL,
  p_year INTEGER DEFAULT NULL,
  p_limit INTEGER DEFAULT NULL,
  p_offset INTEGER DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  WITH
  -- One row per query token with its LIKE-escaped pattern, materialised
  -- once (referenced by every branch) instead of re-derived per row.
  token_pats AS (
    SELECT u.t, public.search_token_pattern(u.t) AS pat
    FROM unnest(coalesce(p_tokens, '{}'::text[])) AS u(t)
  ),
  -- Branch 1 — story columns: title, district slug, category label.
  story_column_hits AS (
    SELECT tp.t, s.id AS story_id
    FROM token_pats tp
    JOIN public.stories s
      ON public.search_norm(s.canonical_title) ILIKE tp.pat
      OR public.search_norm(s.district_id) ILIKE tp.pat
      OR public.search_norm(s.primary_category) ILIKE tp.pat
  ),
  -- Branch 2 — member article headlines.
  article_title_hits AS (
    SELECT tp.t, sa.story_id
    FROM token_pats tp
    JOIN public.articles a ON public.search_norm(a.headline) ILIKE tp.pat
    JOIN public.story_articles sa ON sa.article_id = a.id
  ),
  -- Branch 3 — entity names behind member articles.
  entity_hits AS (
    SELECT tp.t, sa.story_id
    FROM token_pats tp
    JOIN public.entities e ON public.search_norm(e.canonical_name) ILIKE tp.pat
    JOIN public.article_entities ae ON ae.entity_id = e.id
    JOIN public.story_articles sa ON sa.article_id = ae.article_id
  ),
  -- Branch 4 — source names/domains behind member articles.
  source_hits AS (
    SELECT tp.t, sa.story_id
    FROM token_pats tp
    JOIN public.sources src
      ON public.search_norm(src.name) ILIKE tp.pat
      OR public.search_norm(src.domain) ILIKE tp.pat
    JOIN public.articles a ON a.source_id = src.id
    JOIN public.story_articles sa ON sa.article_id = a.id
  ),
  -- AND semantics: a story matches when it hit EVERY distinct token in ANY
  -- branch (counts deduplicate a token found via several branches).
  hit_counts AS (
    SELECT parts.story_id, count(DISTINCT parts.t) AS n
    FROM (
      SELECT * FROM story_column_hits
      UNION ALL SELECT * FROM article_title_hits
      UNION ALL SELECT * FROM entity_hits
      UNION ALL SELECT * FROM source_hits
    ) AS parts
    GROUP BY parts.story_id
  ),
  -- Article-side filter facts (type, language): one scan of memberships.
  -- The guard makes an unset filter cost only rejected rows — no probes.
  article_facts AS (
    SELECT sa.story_id,
           bool_or(a.article_type = p_article_type) AS type_ok,
           bool_or(a.language = p_language) AS language_ok
    FROM public.story_articles sa
    JOIN public.articles a ON a.id = sa.article_id
    WHERE NOT (p_article_type IS NULL AND p_language IS NULL)
    GROUP BY sa.story_id
  ),
  -- Source filter: its own membership scan (joined to sources by name —
  -- the registry-name contract Phase 32 established). SubPlan under an
  -- `IS NULL OR` short-circuit, so it is never built when unset.
  source_ids AS (
    SELECT DISTINCT sa.story_id
    FROM public.story_articles sa
    JOIN public.articles a ON a.id = sa.article_id
    JOIN public.sources src ON src.id = a.source_id
    WHERE p_source IS NOT NULL AND src.name = p_source
  ),
  matched AS (
    SELECT s.id, s.canonical_title, s.first_seen_at
    FROM public.stories s
    LEFT JOIN article_facts af ON af.story_id = s.id
    WHERE
      -- Story-column filters (the plan's list; NULL = not filtered).
      (p_district IS NULL OR s.district_id = p_district)
      AND (p_category IS NULL OR s.primary_category = p_category)
      AND (p_event_type IS NULL OR s.event_type = p_event_type)
      AND (
        p_year IS NULL
        OR (
          s.first_seen_at >= (p_year::text || '-01-01T00:00:00+05:30')::timestamptz
          AND s.first_seen_at < ((p_year + 1)::text || '-01-01T00:00:00+05:30')::timestamptz
        )
      )
      -- Article-side filters.
      AND (p_article_type IS NULL OR COALESCE(af.type_ok, FALSE))
      AND (p_language IS NULL OR COALESCE(af.language_ok, FALSE))
      AND (p_source IS NULL OR s.id IN (SELECT story_id FROM source_ids))
      -- Text: EVERY token matched somewhere (empty token list = no text
      -- constraint, i.e. filters-only browse).
      AND (
        cardinality(coalesce(p_tokens, '{}'::text[])) = 0
        OR EXISTS (
          SELECT 1
          FROM hit_counts h
          WHERE h.story_id = s.id
            AND h.n = (
              SELECT count(DISTINCT t)
              FROM unnest(coalesce(p_tokens, '{}'::text[])) AS x(t)
            )
        )
      )
  ),
  ranked AS (
    SELECT
      m.id,
      m.first_seen_at,
      -- Rank tier 1: every token appears in the headline itself.
      (
        cardinality(coalesce(p_tokens, '{}'::text[])) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM token_pats tp
          WHERE public.search_norm(m.canonical_title) NOT ILIKE tp.pat
        )
      ) AS title_match
    FROM matched m
  ),
  page AS (
    SELECT r.id, r.title_match, r.first_seen_at
    FROM ranked r
    ORDER BY r.title_match DESC, r.first_seen_at DESC, r.id DESC
    LIMIT LEAST(coalesce(p_limit, 20), 100)
    OFFSET GREATEST(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM ranked),
    'ids', coalesce(
      (
        SELECT jsonb_agg(p.id ORDER BY p.title_match DESC, p.first_seen_at DESC, p.id DESC)
        FROM page p
      ),
      '[]'::jsonb
    )
  )
$$;

-- Reverse-key indexes for the set-based branches (article → story and
-- article → entity probes).
CREATE INDEX IF NOT EXISTS idx_article_entities_article
  ON public.article_entities (article_id);
CREATE INDEX IF NOT EXISTS idx_story_articles_article
  ON public.story_articles (article_id);
