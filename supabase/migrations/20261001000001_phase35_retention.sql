-- ProjectBihar Newsfeed V2 — Phase 35: Storage Retention.
--
-- Plan: "Keep the system within free database/storage limits."
--
-- Permanent rows — URL, canonical URL, headline, publisher description,
-- publication metadata, hashes/fingerprints, entities, locations,
-- classification, story relationships, diagnostic scores — are exactly the
-- foundation schema, and this migration never writes to them. The two
-- payloads the plan marks TEMPORARY — raw HTML and the full extracted
-- article body — get their own table with an expiry:
--
--   * expires_at defaults to now() + 10 days. The plan's recommended
--     initial retention is 7–14 days; 10 sits in the middle of that
--     window. The expiry is FIXED at first store: a re-fetch merges into
--     the existing row without sliding the window, so daily-crawled pages
--     cannot keep their HTML alive forever (bounding storage is the point,
--     not caching).
--   * keep_reason (regression_fixture | manual_review | debugging) is the
--     plan's "longer only where needed" valve. Exempt rows must carry
--     expires_at = NULL (CHECK-enforced), so only an explicit release
--     (set keep_reason = NULL and a fresh expiry) puts a document back
--     under automatic retention.
--   * run_retention_cleanup() deletes only rows whose expiry has passed
--     and returns a jsonb report {deleted, remaining, exempt, ran_at}.
--     NULL never satisfies `<= now()`, so exempt rows are safe by
--     construction, not by a special case.
--
-- The scheduled process is scripts/retention-cleanup.mjs (npm run
-- retention:cleanup), which calls this function over PostgREST on a daily
-- cadence (plan §50 maintenance responsibilities: "temporary text
-- cleanup"). It exits non-zero when it cannot run, so a scheduler
-- surfaces a broken configuration instead of silently letting storage
-- grow.
--
-- Raw HTML ingress: the fetch runner copies every successful response into
-- this table (crawler/retention/temp-store.ts). The extracted-body writer
-- lands with the fetch → extract → store wiring; the column exists now so
-- the retention policy covers both payloads the plan lists.
--
-- The public archive never reads this table: story/article pages hydrate
-- from permanent rows only. The Phase 35 gate (tests/retention.test.ts)
-- runs the cleanup over a fully-populated story and proves every
-- permanent column and every archive/search query is unchanged.

-- temp_documents ----------------------------------------------------------------

CREATE TABLE public.temp_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  -- Provenance only: expiry governs the row's lifetime, so deleting an
  -- article or a queue row detaches the link (SET NULL) but never deletes
  -- a within-retention document early — and never leaves an orphan.
  queue_id BIGINT REFERENCES public.crawl_queue (id) ON DELETE SET NULL,
  article_id BIGINT REFERENCES public.articles (id) ON DELETE SET NULL,
  raw_html TEXT,
  body TEXT,
  keep_reason TEXT
    CONSTRAINT temp_documents_keep_reason_check
    CHECK (keep_reason IS NULL OR keep_reason IN ('regression_fixture', 'manual_review', 'debugging')),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '10 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Exactly one of the two lifetime states, never both and never neither:
  -- automatic retention (keep_reason NULL, expires_at set) XOR exemption
  -- (keep_reason set, expires_at NULL). A row with neither would be
  -- retained forever without declaring why — the plan forbids that, so
  -- the CHECK rejects it. Writers claiming keep_reason must set
  -- expires_at explicitly to NULL (the storeTempDocument helper does).
  CONSTRAINT temp_documents_lifetime_check
    CHECK ((keep_reason IS NULL) <> (expires_at IS NULL)),
  -- A document with no payload would be storage with no purpose.
  CONSTRAINT temp_documents_payload_check
    CHECK (raw_html IS NOT NULL OR body IS NOT NULL)
);

COMMENT ON TABLE public.temp_documents IS
  'TEMPORARY storage (Phase 35): raw HTML + extracted body, 10-day retention (plan window 7-14 days). Exempt rows (keep_reason) carry expires_at NULL and never auto-expire. Never read by the public archive — permanent metadata lives in articles/stories/entities.';
COMMENT ON COLUMN public.temp_documents.expires_at IS
  'Fixed at first store (now() + 10 days). Merges never refresh it. NULL only for keep_reason exemptions.';
COMMENT ON COLUMN public.temp_documents.keep_reason IS
  'Plan: longer retention only for regression fixtures, manual review, debugging. NULL = under automatic retention.';

-- Partial index: the cleanup scan only ever looks at expirable rows.
CREATE INDEX idx_temp_documents_expires
  ON public.temp_documents (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TRIGGER trg_temp_documents_updated_at BEFORE UPDATE ON public.temp_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- run_retention_cleanup ---------------------------------------------------------
-- The scheduled cleanup process's work unit. Safe to run at any time, any
-- number of times: it can only ever delete temp_documents rows whose
-- expires_at has passed, and it reports what it did.

CREATE OR REPLACE FUNCTION public.run_retention_cleanup()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INTEGER;
  v_remaining INTEGER;
  v_exempt INTEGER;
BEGIN
  DELETE FROM public.temp_documents
    WHERE expires_at IS NOT NULL AND expires_at <= now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT count(*),
         count(*) FILTER (WHERE keep_reason IS NOT NULL)
    INTO v_remaining, v_exempt
    FROM public.temp_documents;

  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'remaining', v_remaining,
    'exempt', v_exempt,
    'ran_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.run_retention_cleanup() IS
  'Phase 35 scheduled retention: deletes expired temp_documents only, returns {deleted, remaining, exempt, ran_at}. Called by scripts/retention-cleanup.mjs over PostgREST. Touches no permanent archive metadata.';
