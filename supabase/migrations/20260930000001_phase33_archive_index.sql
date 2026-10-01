-- ProjectBihar Newsfeed V2 — Phase 33: Archive index.
--
-- The public archive (`/archive?year=2026&month=09`) paginates and
-- date-filters stories by first-reported time with a PostgREST range
-- query. Phase 2 indexed `last_seen_at`, category, district, and status,
-- but not `first_seen_at` — archive queries would seq-scan `stories` as
-- history grows, breaking the Phase 33 gate ("large article/story counts
-- remain performant").
--
-- The composite order (first_seen_at DESC, id DESC) matches the archive's
-- ORDER BY exactly, so both the date-range predicate and the ordering are
-- index-backed, and the id tiebreak keeps offset pages stable when two
-- stories share a first-reported timestamp.

CREATE INDEX idx_stories_first_seen ON public.stories (first_seen_at DESC, id DESC);
