-- ProjectBihar Newsfeed V2 — Phase 22: correction classifier version.
--
-- The plan requires every correction to store the classifier/rule version
-- that produced the original prediction. Fresh databases get the column
-- from this migration; no backfill (earlier rows predate corrections UI).

ALTER TABLE public.admin_corrections
  ADD COLUMN IF NOT EXISTS classifier_version TEXT;

COMMENT ON COLUMN public.admin_corrections.classifier_version IS
  'Classifier/rule version behind the original prediction (Phase 22 audit requirement).';
