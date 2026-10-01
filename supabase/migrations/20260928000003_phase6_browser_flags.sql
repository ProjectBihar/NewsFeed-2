-- ProjectBihar Newsfeed V2 — Phase 6: browser-fallback routing flags.
--
-- GENERATED FILE. Do not hand-edit.
-- Source: data/sources/registry.json (requires_browser fields)
-- Regenerate: npm run registry:generate
-- Registry version: 1, flagged sources: 0

ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS requires_browser BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.sources.requires_browser IS 'Operator-set: use Playwright fallback for this source. Never auto-escalated; evidence required (Phase 6).';

-- No flagged sources: every registry source stays HTTP-only.
