# Source registry

One canonical catalogue: `registry.json`. The database holds rows;
this file holds truth. `scripts/generate-source-seed.mjs` renders the
SQL migration; `tests/source-registry.test.ts` enforces sync.

## Groups

national-english, national-hindi, bihar-english, bihar-hindi,
district-local, business, environment, education, official,
institutional.

Wave A intentionally leaves `district-local` and `education` empty:
district media is Wave C, specialist desks are Wave D. Empty groups
are documented, not silently missing.

## Entry rules

- Every source specifies name, domain, language, scope, source_type,
  priority, active — plus group, wave, notes, and endpoints.
- Every discovery channel lives in `endpoints` with a verified URL.
- `active: true` only with `verification` evidence of http-200 and the
  expected content type, checked 2026-09-28.
- `active: false` requires a `notes` reason (e.g. http-403 bot-block,
  candidate for Phase 6 browser fallback). Inactive entries are a
  worklist, not coverage.
- Never guess URLs: two guessed PRS paths 404d during verification
  and were excluded for exactly that reason.

## Regenerate the seed migration

```bash
npm run registry:generate
```

Do not hand-edit
`supabase/migrations/20260928000002_phase3_sources.sql`.
The generator also renders
`supabase/migrations/20260928000003_phase6_browser_flags.sql`
(ALTER + per-domain UPDATEs) from the `requires_browser` fields below.

## requires_browser (Phase 6)

- Default `false`. Browser fallback is opt-in, never automatic: a
  403/blocked history does not escalate a source by itself.
- Set `true` only with evidence (HTTP blocked but Chromium renders).
  Evidence probe 2026-09-28: News18 Bihar and PIB return http-403
  Access Denied even in real headless Chromium — bot mitigation, not
  a rendering gap — so both flags stay `false`. All 14 sources are
  HTTP-only until such evidence appears.
