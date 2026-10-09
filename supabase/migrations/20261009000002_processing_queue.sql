-- Fetch and semantic processing have separate claims/retries. A worker crash
-- after acquisition must resume stored HTML, not strand or redownload the URL.
BEGIN;
ALTER TABLE public.crawl_queue DROP CONSTRAINT crawl_queue_status_check;
ALTER TABLE public.crawl_queue ADD CONSTRAINT crawl_queue_status_check
  CHECK (status IN ('discovered', 'queued', 'fetching', 'fetched', 'processing',
                   'extracted', 'rejected', 'retry', 'failed', 'blocked', 'complete'));
ALTER TABLE public.crawl_queue
  ADD COLUMN processing_attempts integer NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0),
  ADD COLUMN processing_claimed_at timestamptz,
  ADD COLUMN processing_next_retry_at timestamptz,
  ADD COLUMN processing_diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX idx_queue_processing ON public.crawl_queue (processing_next_retry_at, discovered_at)
  WHERE status IN ('fetched', 'processing');
-- Stable knowledge identifiers connect JSON catalogues with numeric DB keys.
ALTER TABLE public.entities ADD COLUMN knowledge_id text UNIQUE;
COMMIT;
