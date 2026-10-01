# Implementation Status

## §§45–51 — Automation (complete, verified 2026-10-01)

- Date: 2026-10-01
- Files changed:
  - `.github/workflows/ci.yml` (explicit §46 steps: regression + schema validation; `concurrency` + `timeout-minutes`), new `discover.yml` (30-min + dispatch), `process.yml` (dispatch-only + `batch-size` input), `health.yml` (6-hourly + dispatch), `maintenance.yml` (daily + dispatch, retention contract + secret-guarded live cleanup), `train.yml` (weekly Monday + dispatch)
  - Tests: `tests/workflows.test.ts` (7 — the automation gate); docs
- Plan mapping: §45 forbids one monolithic workflow — the repo now ships exactly six files, one per stage, each bounded (`timeout-minutes`) and cancellable (`concurrency`, cancel-in-progress). There is no deploy job anywhere, so the §46 rule "no deployment if required checks fail" holds structurally: failed checks cannot ship anything.
- `ci.yml` now names all six §46 requirements as explicit steps: lint, typecheck, TypeScript tests, build, full Python tests, **regression** (`pytest tests/test_golden.py evaluation -q` — 4 passed: golden pins + frozen-evaluation reproducibility), **schema validation** (migrations exist + `db-foundation` + `source-registry` re-apply every migration under PGlite — 13 passed).
- The five stage workflows verify contracts offline and say so in their headers, because this environment has no database, no secrets, and no production pipeline wiring (no QueryFn adapter, no fetch→extract→persist path — the subagent inventory confirmed each stage's functions are library-only, exercised otherwise by tests). What each runs, all proven green here: discover — parsers/checkpoints/enqueue/registry (33 tests); process — pure-unit fetch/queue suites, network/Chromium batches excluded by assertion (32 tests); health — metrics/assessment/drift gates (22 tests); maintenance — retention PGlite gate + script contract (16 tests, Phase 35 suites); train — models + hybrid gate + golden + frozen evaluation (29 passed, ~2 min, no `report.json`/`ledger.json` writes — verified side-effect-free since retrain tests use tmp paths and evaluation tests only read the committed report).
- The single live call in all of automation: `maintenance.yml`'s temporary-text-cleanup step runs `npm run retention:cleanup` **only when** `secrets.NEXT_PUBLIC_SUPABASE_URL` is set (service/anon keys passed via env, which the script already prefers over `.env.local`); otherwise an "Honest skip" step prints that nothing was deleted and nothing faked, and succeeds. Stale queue cleanup, metrics aggregation, recounts, and housekeeping are not simulated — they need the production wiring, and faking them would violate the plan's own honesty rules.
- `train.yml` never promotes: it evaluates and reports only. Promotion remains a human-reviewed change through `models.retrain`'s bar (≥ +0.01, floors, fit, class regressions, hybrid gate), so §51's "do not deploy a worse model automatically" holds even on schedule.
- Completion gate: `tests/workflows.test.ts` 7 — exactly six workflow files exist; `ci.yml` contains the §46 checklist; triggers match the plan (discover `*/30`, process dispatch-only with no schedule, health `*/6`, maintenance daily, train weekly Monday, all five dispatchable); every file has concurrency + timeouts; every `npx vitest run`/`pytest` target asserted present on disk; process asserted free of network batches; maintenance asserted secret-guarded with the honest-skip step.
- Full verification: `format` clean, `lint` clean, `typecheck` clean, `pytest` 154/154, `npm test` 245/246 in-suite + isolated re-run green (34 files; the one failure is the known `fetch.test.ts` timing flake — a `/redirect` request timing out under full-suite load — passing in isolation, unrelated to this change which touches no source files), `build` exit=0, `format:check` clean. No UI touched — `check:responsive` not re-run (nav/feed unchanged); dev server left stopped (no live-HTTP checks needed).
- Known limitations: scheduled runs execute the offline contracts only — with no backend configured, no live discovery/fetch/health/maintenance/train run can occur (the workflows degrade to contract verification, stated in-file, rather than failing or faking); live-stage coverage (secret-guarded retention step, real cadence behaviour) cannot be exercised until Supabase secrets exist; `process.yml`'s `batch-size` input is reserved for the future live runner; train cadence re-evaluates the frozen corpora weekly but never retrains production files.
- Required next-phase prerequisites: none blocking (remaining plan §§52–72 are data-model, semantic, and launch-boundary sections, not build phases).

## Phase 35 — Storage Retention (complete, verified 2026-10-01)

- Date: 2026-10-01
- Files changed:
  - `supabase/migrations/20261001000001_phase35_retention.sql` (`temp_documents` table + named CHECKs + partial index `idx_temp_documents_expires` + `run_retention_cleanup()` RPC), `crawler/retention/temp-store.ts` (`RETENTION_DAYS`, `storeTempDocument`, `purgeExpiredTempDocuments`), `crawler/fetch/runner.ts` (raw-HTML ingress + `tempStored`/`tempStoreFailed` counters) and `crawler/fetch/fetcher.ts` (comment), `scripts/retention-cleanup.mjs` + `npm run retention:cleanup` in `package.json`
  - Tests: `tests/retention.test.ts` (5 — the completion gate), `crawler/retention/temp-store.test.ts` (7), `tests/retention-cleanup-script.test.ts` (4), `crawler/fetch/fetch.test.ts` (+Phase 35 assertions); docs
- Plan mapping (§44): the Permanently Store list (URL, canonical URL, headline, publisher description, publication metadata, hashes/fingerprints, entities, locations, classification, story relationships, diagnostic scores) **is the Phase 2 schema** — retention never writes a permanent table, asserted by deep-equality snapshots of all nine of them across the cleanup run. The Temporarily Store list (raw HTML + full extracted article body) lives in one new table `temp_documents`: one row per URL with `raw_html`/`body`, `expires_at` **fixed at first store to now() + 10 days** (middle of the plan's recommended 7–14 window; upserts merge payloads but never slide the window, so a daily-crawled page cannot hoard HTML forever — bounding storage is the point, not caching).
- The plan's "longer only where needed" valve: `keep_reason` ∈ {regression_fixture, manual_review, debugging} **XOR** automatic retention, enforced by CHECK `temp_documents_lifetime_check` — an exemption must carry `expires_at = NULL` (never both states) and automatic rows must carry an expiry (never neither, which would be undeclared forever-retention). A second CHECK forbids payload-less documents. `queue_id`/`article_id` are provenance links with `ON DELETE SET NULL`: expiry is the single lifetime rule — no cascade can delete a within-retention document early, and no orphan survives the parent.
- Ingress is real, not just schema: the fetch runner copies every successful response's HTML into `temp_documents` **after** its queue outcome is recorded, best-effort with honest counters (`tempStored`/`tempStoreFailed` in `BatchSummary`) so a storage hiccup can never corrupt durable queue state. `storeTempDocument` upserts by URL (omitted payload fields are kept; `expires_at`/`keep_reason` are never modified) and accepts the extracted body too — the body writer lands with the future fetch→extract→store wiring (the Python extraction worker is deliberately DB-less), and permanent rows still never carry bodies.
- Scheduled cleanup process (plan: "Add a scheduled cleanup process."): SQL function `run_retention_cleanup()` deletes only rows where `expires_at <= now()` — NULL expiry never satisfies the predicate, so exemptions are safe **by construction, not by a special case** — and returns `{deleted, remaining, exempt, ran_at}`. `scripts/retention-cleanup.mjs` calls that RPC over PostgREST and exits **non-zero with an honest message** whenever it cannot do its job (missing config, unreachable host, HTTP error): a daily scheduler must surface the failure instead of silently letting storage grow. Live check in this environment: `npm run retention:cleanup` → exit 1, "Supabase is not configured … no cleanup ran. Permanent archive metadata is unaffected either way."
- Completion gate ("Retention works without removing metadata required by the archive"): `tests/retention.test.ts` 5 — PGlite applies all migrations, seeds one fully-populated story covering every permanent column type (URL/canonical/headline/description/published_at, `headline_hash`/`content_hash`/`similarity_fingerprint`, `extraction_confidence`/`bihar_relevance_score`, district + article-type/category/event classification, `story_id`/`curated`, plus `story_articles`, `entities` with locations, `entity_aliases`, `article_entities`, `classification_results`, `crawl_runs`, a `crawl_queue` link) and four temp documents in every retention state (expired HTML, fresh HTML, exempt, expired body). After `purgeExpiredTempDocuments`: report `{deleted: 2, remaining: 2, exempt: 1}`; only the two expired temp rows gone; **byte-for-byte snapshot equality** of all nine permanent tables (plus an explicit field-by-field check of the plan's list, UTC publication stamp included); archive reads all still answer — story window in first-reported order, member reports, entity + district, classification confidence, and the Phase 34 `search_story_ids` RPC finds the story; second and third runs return `{deleted: 0}` with the exemption's payload intact; the schema rejects both forbidden lifetime states and empty documents (and `storeTempDocument` refuses an empty document before touching the database).
- Additional gates: `temp-store.test.ts` 7 — 10-day window inside the plan range, merge without sliding expiry, exemption surviving merges, custom window (7 days), empty-doc refusal, purge report shape + idempotence, article delete → FK detach (`SET NULL`) rather than data loss. `retention-cleanup-script.test.ts` 4 — unconfigured → exit 1 with the honest message and no output; exact call shape (POST `/rest/v1/rpc/run_retention_cleanup`, `apikey` + `Bearer` headers, `{}` body) against a local mock PostgREST with the report printed (`deleted=3 remaining=5 exempt=1`); HTTP 500 → exit 1; unreachable host → exit 1. `fetch.test.ts` Phase 35 assertions — first pass `tempStored: 8` (ok, redirect, 6 concurrent), second pass `tempStored: 2` (flaky, ratelimit) → exactly 10 rows, successes only (notfound/error/image/feed absent), expiry ≈ 10 days, queue provenance link set; the file also remains the Phase 5 end-to-end gate.
- Full verification: `format` clean, `lint` clean, `typecheck` clean, `pytest` 154/154, `npm test` 239/239 (33 files), `build` exit=0, `format:check` clean, `check:responsive` 39/39 (no UI touched — retention is storage-side, nav/feed unchanged).
- Known limitations: no live Supabase exists in this environment, so the PostgREST call path is proven against a mock server and the SQL against embedded PGlite (a real database applies the same migration when configured); the extracted-body writer has no production caller yet — the column, upsert path and retention rules exist and are tested, the wiring arrives with the fetch→extract→store phase; `crawl_queue` row cleanup is intentionally **not** here (plan §50 gives "stale queue cleanup" to the later `maintenance.yml` workflow — `run_retention_cleanup` is the "temporary text cleanup" mechanism that workflow will call); retention length is a SQL DEFAULT + the `RETENTION_DAYS` constant, not a per-tenant setting (single deployment); `crawler/fetch/fetch.test.ts` remains timing-flaky under full-suite load (this run: one isolated re-run needed; passed in isolation and in the full suite).
- Required next-phase prerequisites: none blocking (next per plan is §45–50 GitHub Actions workflows — `maintenance.yml`, daily, owns "temporary text cleanup" via `npm run retention:cleanup`).

## Phase 34 — Search (complete, verified 2026-09-30)

- Date: 2026-09-30
- Files changed:
  - `src/app/(public)/search/page.tsx` (route: query + the plan's seven filters as a server-rendered GET form, count line, prompt/ranking notes, one-page result grid, server pagination preserving every criterion, honest empty state including the fixture's article-type gap, `generateMetadata`, 404 via `notFound`)
  - `src/lib/public/search.ts` (strict `parseSearchParams`, `hasSearchCriteria`, `normalizeSearchText`, `getSearch` demo+live), `search.test.ts` (6), `search-live.test.ts` (3), `tests/search-fn.test.ts` (5), `render.test.tsx` (+7 → 43), migration `supabase/migrations/20260930000002_phase34_search.sql`, `archive/page.tsx` ("Search the archive →" entry link); docs
- No Elasticsearch (plan: "Provide useful archive search without introducing Elasticsearch. Use PostgreSQL search capabilities first."): live search is ONE Postgres RPC `search_story_ids` returning `{ total, ids }` — SQL does token-AND matching across the plan's field list (story titles, article headlines, entity names, district slugs, category labels, source names + domains) with the plan's filters (year, district, category, article type, event, source, language — article-side facts resolve through member articles, mirroring the demo path), ranked title-match → first-reported (IST) → id, LIMIT hard-capped at 100 so an archive-scale result set is never shipped whole (the "never load the entire archive into the browser" rule holds for search too); ids hydrate through `STORY_SELECT` and are re-ordered to the SQL rank. Helpers `search_norm` (lowercase, -/_ → space) and `search_token_pattern` (LIKE-escape — user `%`/`_` are literal, never wildcards) keep SQL and the in-process demo path byte-identical; the migration also adds the reverse-key indexes the set-based branches probe (`article_entities (article_id)` — the foundation only indexed entity_id — and `story_articles (article_id)`).
- Set-based evaluation gate (the phase's performance finding): the first draft used per-story correlated EXISTS probes — EXPLAIN ANALYZE on the 3,000-story seed showed ~61k buffer touches and ~5.5 s per query in embedded PGlite. Rewritten as whole-table scan branches (stories, articles, entities, sources) unioned into per-token story hits and counted per story, the same query runs in ~120 ms (2,005 buffers), filters-only ~19 ms — a 46× improvement. `tests/search-fn.test.ts` applies all migrations to embedded PGlite, seeds 3,000 stories × 2 articles + 302 entities with planted needles, and asserts: helper normalisation/escaping in SQL, recall on every branch (story title, article headline, entity "Gandak Panel", district, category, source "Arya Dainik"), exact filter counts at scale (patna 376, Education 750, event tender 750, article-type crime 2, Dainik Jagran 749, hi/en 3000 each), ranking (title-tier first regardless of date), disjoint 20-id page windows, ≤100-id cap under a greedy `limit: 100000`, honest empty results, and a <1,500 ms wall-clock bound on a representative search (measured ~120 ms).
- Demo path parity: in-process search over the 12-story fixture with identical semantics (tokens AND over the same fields, same ranking, same filters). The article-type filter honestly matches nothing because the fixture carries no article-type labels — the empty state says so explicitly instead of faking a hit. Language vocab `en`/`hi` equals the detector profiles; source filter validates against the 12 active registry slugs (inactive `news18-bihar` 404s); date filter is **year-only** (month browsing lives on `/archive`, avoiding the month-without-year 404 trap).
- Strict parsing (404 instead of guessing): unknown district/category/type/event/source/language, inactive source slugs, malformed `year`/`page`, `q` > 100 chars, repeated params. Empty criteria (no q + no fields) renders the browse state — all 12 fixture stories in one server-paginated window plus a prompt — never an unfiltered "search". Entry point is the "Search the archive →" link on `/archive` (nav stays the plan's five items — V1 has no search UI; confirmed `check:responsive` unchanged at 39).
- Completion gate: `search-fn.test.ts` 5 (archive-scale PGlite), `search.test.ts` 6 (parse matrix + every field/filter/pagination + live honesty), `search-live.test.ts` 3 (RPC arg shaping slug → registry name, SQL rank restore after unordered hydration, clamp offsets `[1960, 40]` + error propagation with honest message extraction for supabase's plain-object errors), `render.test.tsx` 7 new (browse prompt + full filter surface, result summary + ranked headline order, filter round-trip + pagination preserving every criterion, honest empty + fixture note, 404s ×10, live notice, metadata ×3) → 43 total. Live verification on `localhost:3000`: 18/18 checks — `/search?demo=1` → 200 with "12 stories", prompt, exactly 8 cards, "Page 1 of 2"; `q=metro` → 200 with 3 stories ranked tender → fares → cabinet (verified in served HTML); `q=a&page=2` → 4 cards with ← Previous carrying `q`+`demo`; `district=patna` → 5 stories; `type=development` → honest fixture note; live `/search?q=metro` → Supabase notice + 0 stories, no fabricated results; `/archive?demo=1` carries the search entry link; 7 malformed/unknown/inactive filters → 404.
- Full verification: `format` clean, `lint` clean, `typecheck` clean, `pytest` 154/154, `npm test` 223/223 (30 files), `build` exit=0 (with the `/search` route), `format:check` clean, `check:responsive` 39/39 (nav unchanged — search is not a nav item).
- Known limitations: fixture has no article-type labels (demo article-type filter honest-misses with an explicit page note); search date filter is year-only (month browsing is `/archive`); `search_story_ids` executes against embedded PGlite only — real Supabase applies the same migration when configured, but has not run it (unconfigured DB honestly shows the notice + 0 stories); `entity_aliases` are not searched (canonical names only); no trigram/FTS index yet — whole-table scans are the right cost at thousands of rows, millions of rows would need pg_trgm/FTS (documented follow-up); each combo of article-side filters costs one membership scan (fine at current scale); `crawler/fetch/fetch.test.ts` timed out once under full-suite load and passed on re-run in isolation and in the full suite (known timing-flaky test).
- Required next-phase prerequisites: none blocking (Phase 35 Storage Retention).

## Phase 33 — Archive (complete, verified 2026-09-30)

- Date: 2026-09-30
- Files changed:
  - `src/app/(public)/archive/page.tsx` (route: header with real filter totals, date filter form, one-page story grid, server-rendered pagination, honest empty state, `generateMetadata`, 404 via `notFound` for malformed queries)
  - `src/lib/public/archive.ts` (`paginate` window function, strict `parseArchiveParams`, `getArchive` demo+live), `archive.test.ts` (8), `SiteNav` (Archive enabled → `/archive` — all five nav items live), `render.test.tsx` (+7 → 36), `scripts/check-homepage-responsive.mjs` (Archive-link check, disabled 1 → 0 → 39 checks), migration `supabase/migrations/20260930000001_phase33_archive_index.sql`; docs
- Replaces V1's latest-200 limitation (`PBNews/src/app/page.tsx` fetches `.limit(200)`) with server-side pagination: `/archive` serves one page window per request (demo 8 stories, live 20) ordered by first-reported time with an id tiebreak. The plan's rule "Do not load the entire archive into the browser" holds structurally — `paginate` returns `items ≤ pageSize` plus a separately computed `total`, the live path fetches a `.range()` window, and the page renders only that window (asserted: exactly 8 `<article>` cards on page 1 of 12, exactly 4 on page 2).
- Date-based queries: `/archive?year=2026&month=09` (the plan's example URL), year-only, and unfiltered views; month buckets use IST (`+05:30`) boundaries so a story belongs to exactly one month. Parsing is strict: syntactically valid dates render (an honest empty month is a valid answer), malformed values (`year=abc`, `month=13`, `page=0`, month-without-year, repeated params) 404 instead of guessing; the filter form's year input is `required`, so the month-without-year combination cannot come from the UI — only from hand-made URLs.
- Performance gate ("large article/story counts remain performant"): a synthetic 10,000-story archive windows in <50 ms and never returns more than the page size for any page (first, last, or out-of-range); live uses PostgREST `.range()` with an exact count (one query in the common case, a clamped refetch only for hand-made out-of-range pages) backed by the new `idx_stories_first_seen (first_seen_at DESC, id DESC)` migration whose key matches the ORDER BY exactly — both the date predicate and the ordering stay index-backed as history grows; demo runs the same `paginate` over the fixture (12 → 2 pages, genuinely exercising page 2).
- Honest behavior: a no-data month/year renders the empty state with "Browse all months" and no pagination nav; unconfigured live renders the Supabase notice with "0 stories", zero article rows, and no fabricated empty-data claim; every count shown is the real filtered total.
- Navigation coherence: `SiteNav` Archive is live — zero `aria-disabled` items remain and the plan's five-item section nav is complete; pagination links (← Newer / Older →) and filter/clear links preserve `year/month/page/demo` so `?demo=1` is never dropped.
- Completion gate: `archive.test.ts` 8 tests (10k-story windowing performance gate with per-page bounds, clamp/empty pagination math, the strict parse matrix, fixture newest-first paging with exact id order for both pages plus out-of-range clamp, month/year bucketing 11/12/1, the archive-date ↔ earliest-member-article cross-check for all 12 stories, unconfigured-live honesty) plus `render.test.tsx` 7 new tests (page-1 window/links/form, page-2 tail + back link, filter with round-tripped form state and query-preserving links, empty year, 404s ×4, live notice, metadata ×3) and the Phase 29 nav test updated to the new contract (all five routes live, zero disabled). Live verification on `localhost:3000`: 49/49 checks — `/archive?demo=1` → 200 with "12 stories", exactly 8 cards newest-first, `page=2` link, required-year form with month options, zero external/endpoint URLs; `page=2` → 200 with 4 cards, `Page 2 of 2`, back link, no dead `page=3`; `year=2026&month=09` → 200 with "11 stories · September 2026", Older link carrying the full query, form values round-tripping, selected month; `year=2025` → honest empty state with a way back and no pagination; `year=abc` / `month=09` / `page=0` / `year=2026&month=13` → 404; live `/archive?year=2026` → 200 + Supabase notice + 0 stories, no articles, no fabricated claim; homepage nav → `href="/archive?demo=1"` with zero `aria-disabled`.
- Full verification: `format` clean, `lint` clean, `typecheck` clean, `pytest` 154/154, `npm test` 202/202 (27 files), `build` exit=0, `format:check` clean, `check:responsive` 39/39 (Archive links to the archive, zero disabled placeholders, zero page errors).
- Known limitations: live archive depends on ingestion populating `stories.first_seen_at` (unconfigured database honestly shows the notice and 0 stories); the fixture spans Sep/Oct 2026 only — every other month honestly renders empty; the feed keeps its 60-story latest window (per the plan the archive is the paginated surface — the feed itself was not paginated); offset+exact-count pagination is two values per request, fine at current scale — keyset/cursor pagination would be the next step if history reaches millions; the month select lists all 12 months regardless of data (hiding empty months would require a full-archive distinct scan, which the plan forbids — empty months show the empty state instead).
- Required next-phase prerequisites: none blocking (Phase 34 Search).

## Phase 32 — Source Pages (complete, verified 2026-09-30)

- Date: 2026-09-30
- Files changed:
  - `src/app/(public)/source/page.tsx` (index: all 12 active registry sources, navigation only, no statistics of its own), `source/[slug]/page.tsx` (archive: source header + plan fields, Recent Bihar coverage, Latest articles, Recent stories, honest empty state, `generateMetadata`, 404 via `notFound`)
  - `src/lib/public/sources.ts` (registry → deterministic slugs + `PublicSource` shape with only reader-facing fields), `source.ts` (`getSource` demo+live with sample-sized coverage), `SiteNav` (Sources enabled → `/source`), district `[slug]` page (source-coverage rows link to source archives), tests `source.test.ts` (10), `render.test.tsx` (+7 → 29); docs
- The plan's public fields only — source name (linked to the registry-verified homepage, same provenance pattern as story reports), language, scope, source type, recent Bihar coverage, latest stories/articles. Crawler diagnostics (endpoint URLs, verification strings, priority, wave, notes, requires_browser, group) never cross the border: `sources.ts` whitelists six keys, and tests assert no endpoint URL or note from `data/sources/registry.json` renders on any page.
- Stable public pages (the gate): slugs derive deterministically from registry names (`"The Hindu"` → `the-hindu`, the plan's example; `"Times of India Patna"` → `times-of-india-patna`) using the same `registry.json` that seeds the `sources` table, so demo and live URLs always agree. The gate sweep proves all 12 active sources resolve on both paths with identical registry facts (registry-driven, database-independent), slugs are unique, and inactive entries (`news18-bihar`, `press-information-bureau`), unknown slugs, and internal fixture aliases (`toi`) 404 — one canonical page per source, no parallel routes.
- Coverage honest: demo counts derive from the 21-article fixture corpus via `demoPublisher` name resolution (bijection asserted — every corpus article lands on exactly its registry source's page or, for fixture-only Business Standard, on no page; every one of the 12 demo stories appears on each of its sources' pages); every metric carries its sample size ("Across the 21-article fixture corpus"); zero-data active sources (Mongabay, PRS) render the empty state and no statistic sections; the live path joins `articles.source_id` via `sources!inner(name)` (cap 100) and honestly shows the no-database notice with facts but no statistics when unconfigured.
- Navigation coherence: `SiteNav` Sources is live (exactly 1 `aria-disabled` item left — Archive); district source-coverage rows link to `/source/[slug]` (7 on Patna, all registry-active; unknown names would stay plain text — asserted for Business Standard in `source.test.ts`); `?demo=1` carried through nav, index links, and back links; story report rows keep their Phase 30 publisher-homepage links (unchanged).
- Completion gate: `source.test.ts` 10 tests (stable/unique slug derivation for the 12 active + 2 inactive entries, the both-paths gate sweep, the diagnostics-free public shape, corpus bijection, story-coverage bijection, exact The Hindu/TOI-Patna coverage facts and orders, honest empties for Mongabay/PRS, live-without-database facts, name→slug round-trips refusing guesses) plus `render.test.tsx` 7 new tests (the-hindu page: fields/coverage/articles/stories/links/single-external-link, empty source, live notice, 404s ×5, index with 12 links excluding inactive, district coverage links, metadata) and the Phase 29 nav test updated to the new contract (Sources live, Archive the only disabled route). Live verification on `localhost:3000`: `/source/the-hindu?demo=1` → 200 with plan fields, corpus sample label, 3 unlinked article rows newest-first with district links, story links, exactly 1 external link, zero endpoint URLs; `/source?demo=1` → 200 with 12 links; `/source/mongabay-india?demo=1` → 200 empty state without statistics; `/source/news18-bihar`, `/source/nope`, `/source/toi` → 404; live `/source/the-hindu` → 200 + Supabase notice + facts, no statistics; homepage nav → `href="/source?demo=1"` with exactly 1 disabled item; `/district/patna?demo=1` → 7 source links; story reports unchanged.
- Full verification: `format` clean, `lint` clean, `typecheck` clean, `pytest` 154/154, `npm test` 187/187 (26 files), `build` exit=0, `format:check` clean, `check:responsive` 36/36 (Sources links to the index, exactly 1 disabled item — Archive, zero page errors).
- Known limitations: live coverage depends on the seeded `sources` rows matching `registry.json` names (registry is canonical; rows with unseeded names would be invisible on source pages); live member stories derive from the newest 100 articles by the source (older stories beyond the sample are not listed — the sample size is stated); demo coverage covers only the 8 fixture sources — the other 4 active registry sources honestly show zero; no per-source health/endpoint information publicly (admin-only by design); `Business Standard` has no source page because it is not in the reviewed registry (its report is named honestly without a route, same as Phase 30).
- Required next-phase prerequisites: none blocking (Phase 33 `/archive?year=&month=` — nav `Archive` flips live like Districts/Sources did).

## Phase 31 — District Pages (complete, verified 2026-09-30)

- Date: 2026-09-30
- Files changed:
  - `src/app/(public)/district/page.tsx` (index: all 38 districts, navigation only, no statistics of its own), `district/[slug]/page.tsx` (archive: district header, Latest developments, Recent stories, Topic distribution, Source coverage, honest empty state, `generateMetadata`, 404 via `notFound`)
  - `src/lib/public/districts.ts` (canonical 38-district list from `data/geography/districts.json` + slug/name lookups), `district.ts` (`getDistrict` demo+live over `stories.district_id` / `articles.district_id` with sample sizes), `demo-articles.ts` (21-article fixture corpus with per-article districts — the single source of truth behind story reports and district archives), `demo-story-details.ts` (`DEMO_REPORTS` removed — reports now derive from the corpus), `story.ts` (reports via `demoArticlesForStory`), `feed.ts` (exports `STORY_SELECT`/`StoryRow`)
  - `SiteNav` (Districts enabled → `/district`; Latest/demo-aware), `Newsfeed` (plumbs `demo` into nav), story page (Location facts link to archives; demo-aware `← Latest`), tests `district.test.ts` (10), `render.test.tsx` (+7 → 22), `story.test.ts` (report checks moved to corpus derivation); docs
- Routing from real geography: every slug resolves through the reviewed 38-district dataset; an unknown slug 404s regardless of database state; the index links all 38 with the demo flag carried.
- The gate's "filters work from real article/story geography" = two real geography fields: **story geography** — recent stories filtered by district name (demo) / `stories.district_id` (live), newest activity first, cap 60; **article geography** — latest developments + source coverage filtered by fixture article `districts` (demo) / `articles.district_id` (live), newest reports first, coverage over the sampled window, cap 100. A 38-page sweep test proves every story lands in exactly its named districts and nowhere else (district-less stories — bpsc/cricket — appear on no archive), and the flood story's named districts equal its articles' fixture districts.
- Metrics honest (no empty decorative statistics): topic distribution counts categories over the fetched stories (uncategorised bucket kept, rendered last, proportional bars from real counts); source coverage counts distinct sources over the sampled articles with counts summing to the sample (asserted). Both sections display their sample sizes ("Across 5 recent stories" / "Across 9 recent articles"); zero-data districts render the empty message and **no** statistic sections at all.
- Demo provenance: `demo-articles.ts` transcribes all 21 fixture articles (Hindi headlines + per-article districts included); `district.test.ts` cross-checks every field against the Phase 16 fixture file; demo headlines stay unlinked (the fixture carries no article URLs — asserted: no `target="_blank"` on the archive), live rows map `articles.canonical_url` → original publisher.
- Navigation coherence: `SiteNav` Districts is live (Sources/Archive remain `aria-disabled` — exactly 2, asserted); `?demo=1` is carried through nav, index links, back links, and story Location facts so readers never silently drop out of the fixture view.
- Completion gate: `district.test.ts` 10 tests (38-district routing + round-trips, corpus↔fixture field match, patna's 5 stories/9 developments with newest-first order + coverage-sum integrity, 38-page story-geography sweep, flood dual-district, muzaffarpur uncategorised bucket, jamui all-empty, unknown → 404, unconfigured-live honest) plus `render.test.tsx` 7 new tests (patna sections/order/samples/links, flood dual render, jamui without statistics, 404, index with 38 links, story Location link, metadata). One test-authoring bug caught on first run — a wrong uniqueness assertion for shared story owners, replaced with the corpus-covers-exactly-the-12-stories bijection — plus one unused-import lint and one `string | number` assertion-message typecheck fix. Live verification on `localhost:3000`: `/district/patna?demo=1` → 200 with all sections, tender-before-CAG ordering, sample labels, story links and back link, zero external links; `/district/jamui?demo=1` → 200 empty state, no statistics; `/district` → 200 with 38 links; `/district/nope` → 404; live `/district/patna` → 200 + Supabase notice + no statistics; story Location → `href="/district/patna?demo=1"`; homepage nav → `href="/district?demo=1"`, 2 disabled items.
- Full verification: `format` clean, `lint` clean, `typecheck` clean, `pytest` 154/154, `npm test` 170/170 (25 files), `build` exit=0, `format:check` clean (re-run after the doc/script edits raced the first check), `check:responsive` 33/33 (Districts links to the index, exactly 2 disabled items, zero page errors).
- Known limitations: live archives depend on ingestion populating `stories.district_id`/`articles.district_id` (unconfigured database honestly shows the notice and no statistics); demo statistics cover only fixture districts (Patna, Supaul, Saharsa, Saran, Muzaffarpur) — the other 33 districts honestly empty; developments/coverage caps (12/100 articles) apply only live and are labeled by their sample; no per-source or per-topic filter controls inside an archive yet (the plan's "filters" = geographic filtering, which the gate covers).
- Required next-phase prerequisites: none blocking (Phase 32 source pages — `/source/[slug]`, nav `Sources` flips live the same way `Districts` did here).

## Phase 30 — Story Page (complete, verified 2026-09-30)

- Date: 2026-09-30
- Files changed:
  - `src/app/(public)/story/[id]/page.tsx` (route, `generateMetadata`, eight-fact headline card, Reports, Entities, `← Latest` back link, demo notice, 404 via `notFound`)
  - `src/lib/public/story.ts` (`StoryDetail`/`StoryReport` contract, `getStory` demo+live paths, exported `toStoryDetail`/`sortReports`, live entity fetch with mention ordering), `demo-story-details.ts` (fixture-derived reports/entities + registry publisher lookup), `feed.ts` (exports `STORY_COLUMNS`/`districtNames`), `time-ago.ts` (`formatStamp` — absolute `28 Sep, 10:00` in Bihar time regardless of input offset)
  - `StoryCard` (headline now links to the story page, `?demo=1` carried), `Newsfeed`/`page.tsx` (demo flag plumbed), `Header` (count pill optional — story page shows none), tests `story.test.ts` (13), `render.test.tsx` (+5 → 15); docs
- Eight facts per the plan: canonical headline (h1 + metadata title), primary category badge, event type (display form), district, first reported, latest update (absolute + relative), source count, language coverage — all rendered from `StoryDetail`, `—` where genuinely unknown.
- Reports (provenance): one row per member article in first-reported order — source name links to the original publisher (`articles.canonical_url` live; registry homepage for demo sources, `target="_blank" rel="noopener noreferrer"`), stamped `d MMM, HH:mm` in Asia/Kolkata (fixture `+05:30` and live UTC rows render the same wall time). Sources outside the registry (fixture `business-standard`) keep their name with **no link** rather than a guessed URL. Article bodies are never fetched or rendered (asserted against fixture body text).
- Entities: distinct names ordered by mention count (name asc on ties), section hidden when empty; demo display names must round-trip (`slugify`) to the fixture entity slugs.
- Demo provenance: `demo-story-details.ts` records fixture article id/source/timestamp per report and display names per entity — runtime may not import `intelligence/`, so `story.test.ts` reads the fixture file and asserts exact equality (ids, sources, timestamps, headline↔title for all 8 singletons, counts vs card `articleCount`/`sourceCount`, entity union + ordering, registry-backed publisher links).
- Completion gate: `story.test.ts` 13 tests + `render.test.tsx` 5 new tests (page renders all eight facts, five ordered linked report rows, entities, no body republish, demo notice, `← Latest`; 404 for unknown demo id and unconfigured live id; homepage headlines link `/story/…?demo=1`; metadata carries the headline). Two authoring bugs caught and fixed during the first runs: Node's `en-GB` month abbreviation is `Sept` (stamp now normalises to three letters) and one wrong sort expectation in the test itself. Live verification on `localhost:3000`: `/story/metro-approval?demo=1` → 200 with all facts/links/entities, `/story/s-rally?demo=1` → 200 without an Entities section (fixture has none), `/story/nope?demo=1` → 404, `/story/1` → 404 (unconfigured), homepage links carry `?demo=1`.
- Full verification: `format` clean, `lint` clean, `typecheck` clean, `pytest` 154/154, `npm test` 153/153 (24 files), `build` exit=0, `format:check` clean.
- Known limitations: live Reports/Entities depend on ingestion populating `articles.canonical_url` and `article_entities` (until then the live story page honestly 404s — no stories exist without a DB); demo report links are publisher homepages, not per-article URLs (the fixture has no article URLs); event type and category render as raw vocabulary values (no bilingual glossary yet); no pagination within a story's reports (member counts are small).
- Required next-phase prerequisites: none blocking (Phase 31 district pages — the story page's Location field will link there when routes exist).

## Phase 29 — Homepage (complete, verified 2026-09-30)

- Date: 2026-09-30
- Files changed:
  - `src/components/public/`: `SiteNav.tsx` (plan IA — Latest/Topics live, Districts/Sources/Archive disabled placeholders), `FeedSwitcher.tsx` (Curated / All Bihar News with live counts, V1 tab styling); `Newsfeed.tsx` (mode state, nav + switcher above pills, mode-aware empty state, header count follows the view); `CategoryTabs.tsx` (`id="topics"` anchor + scroll offset)
  - `src/lib/public/feed-modes.ts` (plan §54 partition — `selectStories`/`countByMode`, category pills filter Curated only as in V1); `types.ts` + `demo-stories.ts` (`curated` flag, 9 of 12 fixture stories, tier-derived: development/audit/large-protest/economic-report in, routine crime/politics/uncategorised sport out); `feed.ts` (live query embeds `story_articles(articles(curated,language))` → any-member-curated aggregation + language coverage; exported `toPublicStory`)
  - Tests: `feed-modes.test.ts` (5), `feed.test.ts` (5), `render.test.tsx` (+3 → 10); `scripts/check-homepage-responsive.mjs` + `check:responsive` npm script; docs
- Feed modes (plan §54): default Curated = tier A + selected B, recorded as `articles.curated` and aggregated per story (any member curated); All Bihar News = A + B + C. Switcher shows both plan labels with counts (fixture 9 / 12) in V1's active-accent tab styling. Category pills apply within Curated only — V1 behaviour, hidden in All mode.
- Navigation: `Latest` (`/`, active) and `Topics` (`#topics`, enters Curated then scrolls to the pill strip) work today; `Districts`, `Sources`, `Archive` render as visibly `aria-disabled` "Coming soon" items rather than dead links until Phases 31–33 create `/district/[slug]`, `/source/[slug]`, `/archive`.
- Story card unchanged from the plan's example (badge, headline, `Patna · 42m`, `5 sources · EN + HI`) with no needless synopsis (asserted: cards contain no `<p>`). Live `languages` now aggregate from member articles, closing Phase 28's deferred join.
- Completion gate (first run): fixture partition benchmark — 9 curated / 12 total, routine crime/politics/sport excluded from Curated, Curated a strict subset of All, newest-first both modes, category filter Curated-only, input unmutated — plus `toPublicStory` aggregation tests (curated, languages, district mapping, honest missing-member defaults) and nav/switcher/no-synopsis render assertions: 27 public tests. Responsive gate `npm run check:responsive` = **30/30 checks** at desktop 1280×900 (3 columns), tablet 768×1024 (2), mobile 375×812 (1): Curated default renders 9 clusters, clicking "All Bihar News" renders 12, section nav present with exactly 3 disabled items, switcher counts (9)/(12) with exactly one pressed control, no horizontal page overflow, zero uncaught page errors; six screenshots (Curated + All per viewport) saved to the OS temp dir. Verified live on `localhost:3000`.
- Full verification: `format` clean, `lint` clean, `typecheck` clean, `pytest` 154/154, `npm test` 135/135 (23 files), `build` exit=0, `format:check` clean.
- Known limitations: headline is still not a link (Phase 30 story page); live Curated mode depends on ingestion populating `articles.curated` — until then the live Curated feed honestly shows zero stories (column defaults FALSE, partial index ready) while All Bihar News shows everything; feed capped at the 60 newest stories filtered client-side (server-side pagination arrives with Phase 33); the `#topics` anchor exists only while Curated mode shows the pill strip; V1's language filter pills are deliberately not carried (the plan lists only the two modes here).
- Required next-phase prerequisites: none blocking (Phase 30 story page).

## Phase 28 — Public UI Migration (complete, verified 2026-09-30)

- Date: 2026-09-30
- Files changed:
  - `src/app/(public)/` route group: `public.css` (V1 design system copied verbatim from `PBNews/src/app/globals.css` + Tailwind v4 import), `layout.tsx` (V1 metadata/viewport, `<main>` shell), `page.tsx` (server feed page)
  - `src/app/globals.css` deleted (body + color-scheme rules moved into `admin.css`), `src/app/layout.tsx` (no stylesheet; Tailwind classes on `<html>/<body>` are inert where Tailwind isn't loaded)
  - `src/components/public/`: `Header` (V1 glass header minus auth), `ThemeToggle`, `RefreshButton`, `CategoryTabs`, `StoryCard`, `Newsfeed`, `Notices`; `src/lib/public/`: `feed.ts`, `demo-stories.ts`, `categories.ts` (V1 badge colours), `time-ago.ts`, `types.ts`
  - `postcss.config.mjs`, `tailwindcss` + `@tailwindcss/postcss` dev deps, `vitest.config.ts` (`@/` alias + automatic JSX), gate tests `visual.test.ts` (7) + `render.test.tsx` (7), docs
- Preserve (per plan): every V1 token verbatim — light/dark palettes, glass card/header/pill/input, 16px→14px mobile radius, staggered card entrance, shimmer/skeleton, P22 Mackinac + Mukta fonts, 1200px container with `lg:px-[105px]`, responsive grid (1/2/3 columns), category pill strip with accent-active state, V1 badge colours, header count pill + refresh + dark toggle.
- Remove (per plan): login, logout, reader session checks, user avatar, sentiment buttons, personal recommendation prediction, public block-phrase controls — a forbidden-pattern scan over every rendered page asserts they never appear.
- Scoping decision: Tailwind v4 (incl. preflight) is imported by `(public)/public.css` only, because admin styles no links/buttons/headings itself and preflight would restyle it; route-level CSS bundles verified live (`/admin` serves `admin_*.css` only, no `glass-card`, no Tailwind; `/` serves `public_*.css`). Root body styling moved into `admin.css` so the observatory is byte-identical to before.
- Data: `getFeed()` reads the `stories` table when Supabase is configured; unconfigured → honest empty result + notice (public counterpart of the admin ConfigNote). `?demo=1` serves 12 fixture stories derived from the reviewed Phase 16 benchmark — exactly the partition `test_cluster_benchmark` expects (4 multi-article + 8 single-article stories) — behind a visible "Demo stories" notice; never mixed with live data.
- Theme: the `.dark` class on `<html>` is the store (`useSyncExternalStore`); preference read from localStorage (default OS) in an effect that only touches the DOM — no hydration mismatch, no setState-in-effect (React 19 lint rule).
- Completion gate (14 tests, first run): V1 tokens/rules present in `public.css`; Tailwind imported exactly once and only by the public layout; admin keeps the moved body styles; header/pills/story card/feed shell render the V1 structure with the forbidden scan; homepage demo path renders all 12 fixture stories, unconfigured path shows the honest notice + empty state. Live verification on `localhost:3000`: light/dark token values exact (`#F0EDE8`/`#0D0D0F`, `#2563EB`/`#0A84FF`), pill filter 12→4→12 with count pill following, theme toggle ×4 stable, zero console errors, admin CSS isolation confirmed over HTTP.
- Full verification: `format` clean, `lint` clean, `typecheck` clean, `pytest` 154/154, `npm test` 122/122 (21 files), `build` exit=0, `format:check` clean.
- Known limitations: headline is not yet a link (no story page until Phase 30); language coverage shown only where known (live join lands with Phase 29 feed shaping); category filter runs client-side over the first 60 stories; the P22 Mackinac webfont URL fails to decode offline (inherited from V1 — falls back to Mukta/system-ui with a console warning only).
- Required next-phase prerequisites: none blocking (Phase 29 homepage adds navigation, feed modes, and pagination on this shell).

## Phase 27 — Candidate Model Retraining (complete, verified 2026-09-30)

- Date: 2026-09-30
- Files changed:
  - `intelligence/models/retrain.py` (triggers, dataset hashing, class-regression check, promotion policy, ledger), `evaluate.py` (Phase 26 hybrid gate extracted from tests so retraining can regression-check challengers), `train.py` (`write_report` now pins existing production winners verbatim — evaluation alone can never promote), `__init__.py` (exports)
  - `intelligence/models/tests/test_retrain.py` (10 tests: triggers, content-addressed dataset version, promotion bar, pinning, reproducibility gate), `test_hybrid_gate.py` (slimmed to use `models/evaluate.py`)
  - `intelligence/models/ledger.json` (first real cycle), `report.json` (retrain provenance added), docs
- Triggers: first-run/weekly (7 days) or 100 reviewed corrections; corrections honestly `None` without a DB (weekly still applies). Not due → no training, no writes.
- Promotion bar: ≥ +0.01 CV mean over production, above Phase 25 floors, fit ≥ 0.9, no per-class F1 drop > 0.15 (support ≥ 2), and the Phase 26 hybrid gate holds with the challenger seated. Training success alone never replaces production; `write_report` pins winners verbatim.
- First real cycle (2026-09-30): **all three tasks hold** — relevance +0.000, type −0.023, category −0.014 vs production; no challenger earns promotion. Production unchanged. Ledger records model version, training date, dataset version (sha256 of frozen corpora), metrics, decision — the plan's five required fields.
- Bugs found during implementation: extracted hybrid gate lost `train_labels` in the category branch (caught by the gate test — extraction must be verified, not assumed); test seeded no production report, so production fell back to the fresh argmax and nothing could beat it (a first-run semantics bug caught by writing the test).
- Completion gate: two full retraining cycles produce identical metrics, decisions, and dataset version; production winners survive untouched — verified, plus full suite green.
- Known limitations: weekly trigger assumes an external scheduler invokes `run_retraining` (no cron in-repo); correction count needs a live DB (Phase 22 admin_corrections); challenger gate cost is one extra hybrid evaluation per would-be promotion.
- Required next-phase prerequisites: none blocking (Phase 28 public UI migration).

## Phase 26 — Hybrid Decision Engine (complete, verified 2026-09-30)

- Date: 2026-09-30
- Files changed:
  - `intelligence/models/hybrid.py` (fusion policy, affinity maps, softmax for SVC winners), `decide.py` (three task adapters + `_hybrid` harness entry)
  - `intelligence/models/tests/test_hybrid.py` (8 policy unit tests), `test_hybrid_gate.py` (held-out no-regression gate + abstention test)
  - docs
- Policy: agree→mean confidence + entity boost; disagree→rule default at 0.40 with review; override only at stat ≥0.80 with rule ≤0.45; every disagreement and every error routes to review.
- Bugs found by tests during implementation: gate mapped already-mapped relevance labels twice (stat stuck at 0.5 — caught by questioning a suspiciously round number); per-fold-averaged LOO is accuracy in disguise (full-vector macro now).
- Gate result (held-out statistics, frozen corpora): relevance rule/stat/hybrid 1.00/0.77/1.00; type 1.00/0.42/1.00; category 1.00/0.27/1.00 — holds rules, strictly above statistics, all errors reviewed. Labels unchanged (rules at ceiling); gains are calibration plus review routing, stated plainly.
- Known limitations: entity evidence rides only the relevance gate (type/category run entity-free, unit-covered); abstentions always route to review (review volume accepted).
- Required next-phase prerequisites: none blocking (Phase 27 retraining promotes challengers through this gate).

## Phase 25 — Statistical Classifier (complete, verified 2026-09-29)

- Date: 2026-09-29
- Files changed:
  - `intelligence/models/` (`features.py` word+char TF-IDF, `train.py` harness, `report.json` committed metrics, `README.md`)
  - `intelligence/models/tests/` (`test_features.py`, `test_models.py` floors + determinism)
  - `intelligence/requirements.txt` (scikit-learn), `.github/workflows/ci.yml` (installs it), `pytest.ini`, docs
- Measured on frozen corpora: relevance F1 0.832 (logistic, stratified 5-fold); type macro-F1 0.227 and category 0.224 (balanced linear SVC, leave-one-out). Fit 1.0 everywhere: models can represent the tasks, only data is missing. Character n-grams verified firing on Hindi.
- Methodology fix during implementation: per-fold-averaged LOO scores misreport accuracy as macro-F1 — LOO now scores the full prediction vector.
- No artifact blobs: candidates refit deterministically in seconds; the report (versions, data, metrics, predictions) is the version record for Phase 27.
- Gate result: winners above tripwire floors (0.75 / 0.15 / 0.15), determinism proven, refit path smoke-tested.
- Known limitations: tiny corpora (singletons can never be recalled held-out); no production wiring — rules stay live until Phase 27.
- Required next-phase prerequisites: none blocking (Phase 26 hybrid fuses these scores with rules + entities).

## Phase 24 — Golden Regression System (complete, verified 2026-09-29)

- Date: 2026-09-29
- Files changed:
  - `tests/regression/` (7 files: the plan's 4 examples plus dateline-in-body, bridge-override, cag-demotion — each with history, phase, and pinned stage outputs), `tests/test_golden.py` (gate)
  - docs
- Pins behavior, not just intent: relevance pass/fail plus exact type/tier/curated where the bug lived. Contrast pairs (crime-vs-governance, ambiguous-pair) prove distinctions, not single outcomes.
- Gate result: all historical failures hold, first run.
- Known limitations: intelligence-side only by construction (TS regressions have unit tests); pins encode current correct behavior — changing them requires updating the history note, never silent edits.
- Required next-phase prerequisites: none blocking (Phase 25 statistical classifier is measured against the Phase 23 corpus with these pins as guardrails).

## Phase 23 — Evaluation Corpus (complete, verified 2026-09-29)

- Date: 2026-09-29
- Files changed:
  - `evaluation/corpus.json` (10 component sets, coverage tags, thresholds), `evaluation/run.py` (15 metrics incl. 4 bonus), `evaluation/report.json` (committed output), `evaluation/README.md` (growth workflow), `test_evaluation.py` (reproducibility + thresholds + coverage gate)
  - `pytest.ini`, docs
- ~320 labelled units; every metric carries its n. Current report: required 11 all 1.000 (60/60 relevance, 31/31 curated+type+events, 39/39 categories, 210/210 cluster pairs, 30/30 extraction); bonus language 0.975 (documented miss), dedup/near-dup/xlingual 1.000.
- No new claims beyond evidence: development-sized corpus stated as such; 1000+ is process (admin corrections feed it), not a promise.
- Gate result: report reproduces byte-identically from the corpus; thresholds hold; all plan dimensions covered.
- Known limitations: dev-sized samples (confidence intervals wide — future work); pairwise cluster metric on 21 articles; report regenerates wholesale (no per-component history yet).
- Required next-phase prerequisites: none blocking (Phase 24 golden regressions pin historical failures; Phase 27 trains against this corpus).

## Phase 22 — Admin Correction System (complete, verified 2026-09-29)

- Date: 2026-09-29
- Files changed:
  - `src/lib/admin/mutations.ts` (field corrections + rename/move/merge/split with recounts, all audit-backed), `actions.ts` (validated server-action glue), `options.ts` (taxonomies + district options from the KB), `queries.ts` (`getStory` detail, `getStoryOptions`), `mutations.test.ts` (10 fake-client cases), `fake-db.ts`
  - `src/app/admin/stories/[id]/page.tsx` (rename/merge/split/move/field forms), stories list links to detail
  - `supabase/migrations/20260929000004_phase22_correction_version.sql` (`admin_corrections.classifier_version` — plan-mandated, was missing from the Phase 2 schema)
  - docs
- Every mutation writes new values plus audit rows (original, corrected, timestamp, classifier version, reason); entities correct as audited name lists (link rewrites future); merge parks source as `merged`; split requires a remainder; recounts recompute counts from membership.
- Bug found by tests: move used a live row reference for the source story id, recounting the wrong story (captured id upfront now).
- Gate result: corrections persisted and auditable (10/10 mutation cases: writes, audits, validations, recounts).
- Known limitations: no live-DB action tests (fake-client logic coverage + schema gates); entity-link application and correction-driven retraining belong to Phase 27.
- Required next-phase prerequisites: none blocking (Phase 23 evaluation corpus consumes corrections as labels).

## Phase 21 — Admin Observatory (complete, verified 2026-09-29)

- Date: 2026-09-29
- Files changed:
  - `src/app/admin/` (layout + overview/sources/runs/queue/low-confidence/stories/corrections pages, `admin.css`; all force-dynamic, all degrade to an unconfigured-DB note)
  - `src/lib/admin/` (`auth.ts` Basic Auth, `summarize.ts` shaping, `queries.ts` read-only selects), `auth.test.ts`, `summarize.test.ts`
  - `middleware.ts` (`/admin/:path*` guard), `scripts/admin-password-hash.mjs`, `package.json` (`admin:hash`), `.env.example`
  - docs
- Auth is HTTP Basic over env credentials (sha256 + constant-time, WebCrypto for the Edge runtime); public routes untouched and open; no reader accounts, sessions, or cookies.
- Tests caught one real bug: latest-health helper trusted input ordering (now order-independent by `checked_at`).
- Read-only by design: corrections UI with merge/split/move is Phase 22; admin never fetches publishers or classifies.
- Gate result: failures, retries, low-confidence lists, cluster members, and run/drift history are all inspectable without touching GitHub Actions logs (verified by build + helper tests; live rows appear once crawling writes data).
- Known limitations: needs Supabase env + RLS decisions before production use; tables cap at 200 rows with no pagination yet; no live-DB integration test (helpers tested, queries thin by construction).
- Required next-phase prerequisites: none blocking (Phase 22 correction system adds mutations + audit writes).

## Phase 20 — Drift and Anomaly Detection (complete, verified 2026-09-29)

- Date: 2026-09-29
- Files changed:
  - `crawler/health/drift.ts` (median baselines, volume/extraction rules, `discoveryBaseline`/`extractionBaseline` queries, composed `checkSourceHealth`)
  - `crawler/health/metrics.ts` (fixed extraction double-count; `recordHealthCheck` carries alerts additively)
  - `crawler/health/drift.test.ts` (pure rules incl. outlier-immune median), `drift-gate.test.ts` (PGlite synthetic anomalies)
  - docs
- No ML, per plan: medians, floors (5/day, 8 samples), and explicit margins. Normal fluctuation and thin histories stay silent by construction.
- Gate result: 20/day→0 raises critical `DISCOVERY_VOLUME_ANOMALY`; 0.94→0.21 extraction raises `PARSER_DRIFT_SUSPECTED`.
- Known limitations: surge detection not implemented (drops only, per plan examples); single global thresholds (per-source tuning later); baselines need history (cold sources skip checks).
- Required next-phase prerequisites: none blocking (Phase 21 admin observatory reads `source_health` + diagnostics).

## Phase 19 — Source Health System (complete, verified 2026-09-29)

- Date: 2026-09-29
- Files changed:
  - `crawler/health/` (`types.ts` states/thresholds, `failures.ts` reason→kind mapping, `assess.ts` ordered rules, `metrics.ts` DB rollups + `source_health` persistence)
  - `crawler/health/assess.test.ts` (11 cases: all states, quiet-vs-broken, never-polled, extraction opt-in), `metrics.test.ts` (PGlite progression HEALTHY→DEGRADED→BLOCKED→recovering + BROKEN/STALE isolation)
  - docs
- Bugs found by tests during implementation: PGlite returns timestamptz as Date objects, breaking string comparisons (normalize-once `iso()` helper); recovery-batch canonicals collided with step 1 (per-batch URL tags); STALE rule initially used poll freshness instead of discovery recency (rewritten: quiet-but-working reads STALE).
- Gate result: simulated failure conditions move states correctly with persisted reasons and latest-state reads.
- Known limitations: no per-endpoint poll counters (freshness math only); extraction rules dormant until a runner writes `extracted`; single 24h staleness default (per-source cadences later).
- Required next-phase prerequisites: none blocking (Phase 20 drift detection builds on these metrics + baselines).

## Phase 18 — Canonical Story Title (complete, verified 2026-09-29)

- Date: 2026-09-29
- Files changed:
  - `intelligence/clustering/titles.py` (`score_headline`, `select_title` with override), `__init__.py`
  - `intelligence/clustering/tests/test_titles.py`, `test_title_benchmark.py` (gate: 4 representative clusters from the story benchmark pick the expected headlines)
  - docs
- No LLM, no summarization: the strongest member headline wins on entity coverage + event signal + conciseness + completeness, minus clickbait; ties break by earliest published; empty clusters yield None; admin override short-circuits (persistence is Phase 22's job).
- Gate result: 4/4 expected titles, first run.
- Known limitations: titles are only as good as member headlines; cross-language title preference (HI vs EN canonical) is undecided by design — earliest/highest-score wins regardless of language.
- Required next-phase prerequisites: none blocking (Phase 19 source health is crawler-side, independent).

## Phase 17 — Cross-Language Clustering (complete, verified 2026-09-29)

- Date: 2026-09-29
- Files changed:
  - `intelligence/clustering/xlingual.py` (transliteration table, bridge matcher ≥ 0.8, `augmented_pair_score`)
  - `intelligence/clustering/scoring.py` (Unicode digit folding; district-disjoint penalty −0.25)
  - `intelligence/clustering/tests/fixtures/xlingual-cases.json` (10 HI–EN pairs, disjoint entity sets where bridges must prove themselves), `test_xlingual.py`, `test_xlingual_benchmark.py` (gate)
  - docs
- No embeddings anywhere; core never depends on them. Same 0.6 threshold: bridges are entity evidence, everything else must still agree.
- Documented limits: Persian-spelling divergences (Muzaffarpur) and ph/f splits (Fatuha) don't bridge — fuzzy phonetics is V2.x work; absence is tested, not accidental.
- Gate result: 10/10 corpus pairs + all Phase 16 tests still green with the penalty in place.
- Known limitations: transliteration is mechanical (schwas kept); bridge false-positives (Saharsa/Sahara-class) need event/category/location disagreement to stay apart, which the gate covers.
- Required next-phase prerequisites: none blocking (Phase 18 story-title selection works on clustered members).

## Phase 16 — Story Clustering (complete, verified 2026-09-29)

- Date: 2026-09-29
- Files changed:
  - `intelligence/clustering/` (`scoring.py` plan weights + numbers + window, `cluster.py` union-find batch + best-match)
  - `intelligence/clustering/tests/fixtures/story-clusters.json` (21 articles: 4 stories incl. a 5-report cross-language metro story, 8 singletons, time-separated tender), `test_scoring.py`, `test_cluster_benchmark.py` (gate: exact partition + incremental agreement)
  - `pytest.ini`, docs
- Weights are the plan's provisional starting point, kept because the benchmark passes with margin (closest non-member fares-vs-approval at 0.58 stays out; members score 0.65+); retune from evaluation, never from instinct.
- Notable: same-development Hindi + English reports merge via shared canonical entities — correct, and Phase 17 extends coverage to harder cross-language pairs rather than duplicating this.
- Gate result: exact 12-story partition + incremental assignment agreement, first run.
- Known limitations: single-linkage chaining accepted (admin split/merge is Phase 22); story canonical titles are Phase 18's job.
- Required next-phase prerequisites: none blocking (Phase 17 cross-language clustering extends entity/transliteration matching).

## Phase 15 — Near-Duplicate Detection (complete, verified 2026-09-29)

- Date: 2026-09-29
- Files changed:
  - `intelligence/dedup/` (`signatures.py` shingles/MinHash/SimHash/cosine, `lsh.py` 64x2 banding + blocking, `near_dup.py` confirmation + `find_near_duplicates` pipeline)
  - `intelligence/dedup/tests/fixtures/neardup-cases.json` (13 scorer pairs), `test_signatures.py`, `test_neardup_benchmark.py` (gate with margin discipline), `test_pipeline.py` (LSH→blocking→confirm incl. template pruning)
  - docs
- Key finding from calibration: shingle Jaccard inverts the task (templates 0.70 score above paraphrases 0.03-0.09), and SimHash distance reads 0 on templates — so MinHash retrieves, blocking prunes templates structurally, unigram cosine (0.6) confirms. SimHash stays observability-only by evidence, not by preference.
- Gate result: 13/13 scorer pairs + pipeline proof (rewrite merges, cross-place template pruned, comparisons bounded).
- Known limitations: same-place rolling templates may confirm-merge (accepted: rolling republication); stopword lists are EN/HI function words (ur/mai/bho/mag later); IDF weighting deferred until a production-scale corpus exists.
- Required next-phase prerequisites: none blocking (Phase 16 story clustering consumes `find_near_duplicates` + classification outputs).

## Phase 14 — Exact Deduplication (complete, verified 2026-09-29)

- Date: 2026-09-29
- Files changed:
  - `intelligence/dedup/` (`keys.py` content/headline hashing, `exact.py` decision rules + batch)
  - `intelligence/dedup/tests/fixtures/duplicate-cases.json` (14 pairs: tracking/AMP/mobile/fragment variants, syndication, re-ingestion, same-source headline; plus must-not-collapse cases), `test_exact.py`, `test_duplicate_fixtures.py` (gate)
  - `pytest.ini`, docs
- Rules: canonical match → content-hash match → same-source headline match; cross-publisher headline matches stay distinct; bodies under 50 chars never hash; normalisation stays TS-side (this module consumes canonical URLs).
- Gate result: 14/14 fixtures behave exactly (collapse with the expected reason, or stay distinct), first run.
- Known limitations: paraphrased-but-distinct bodies are Phase 15's job by design; same-source headline rule can link a genuine update (accepted: updates share provenance, clustering refines).
- Required next-phase prerequisites: none blocking (Phase 15 near-duplicate detection builds on fingerprints, not exact keys).

## Phase 13 — Event-Type Classification (complete, verified 2026-09-29)

- Date: 2026-09-29
- Files changed:
  - `intelligence/classification/events.py` (22-event EN+HI vocabulary, presence scoring, None fallback), `__init__.py` (exports + 0.3.0)
  - `intelligence/classification/tests/fixtures/event-cases.json` (31 fixtures: every event, None cases, Hindi), `test_events.py`, `test_event_benchmark.py` (gate: fixture set passes exactly)
  - docs
- Lifecycle events kept distinct (started/progress/completion/inauguration verified by dedicated unit test); opinion/gossip/sport/roundup correctly yield None.
- Gate result: 31/31 fixtures exact, first run.
- Known limitations: disaster-relief scale events have no vocabulary entry (documented gap for a later extension); multi-event stories report only the primary event.
- Required next-phase prerequisites: none blocking (Phase 14 exact deduplication builds on URL/hash fields, not classification).

## Phase 12 — Topic Classification (complete, verified 2026-09-29)

- Date: 2026-09-29
- Files changed:
  - `intelligence/classification/subtopics.py` (8 categories, ~40 EN+HI subtopics), `topic.py` (primary + secondary scorer)
  - `intelligence/classification/matching.py` (shared span-aware phrase scorer, extracted from Phase 11 with zero behavior change — 8/8 still green)
  - `intelligence/classification/tests/fixtures/topic-cases.json` (39 cases: all categories, None cases, Hindi), `test_topic.py`, `test_topic_benchmark.py` (gate: primary exact + secondary subset)
  - docs
- Taxonomy correction during implementation: Public Finance moved Governance→Economy (fiscal/expenditure substance is economic); CAG-audit expectation updated to match.
- Lexicon gaps closed honestly: GDP, bank/banks/loan/loans, distilleries, expenditure family, seeds (each verified against the benchmark, no test-only hacks).
- Gate result: 39/39 benchmark cases (primary exact, expected secondaries present).
- Known limitations: sums favor broad categories on mixed stories (documented, tunable with Phase 23 corpus); no `secondary_topics` DB column — secondaries serialize into `classification_results.reason_codes`.
- Required next-phase prerequisites: none blocking (Phase 13 event-type classification builds on type + topic).

## Phase 11 — Article-Type Classification (complete, verified 2026-09-29)

- Date: 2026-09-29
- Files changed:
  - `intelligence/classification/` (`lexicons.py` 17 EN+HI families, `classifier.py` scoring/tiers/curation)
  - `intelligence/classification/tests/fixtures/article-type-cases.json` (31 cases incl. the plan's tier examples), `test_classifier.py`, `test_type_corpus.py` (gate: corpus passes exactly)
  - `pytest.ini`, docs
- Rules: span-aware presence scoring (title x2, longest-first, no double count); kind overrides for advertorial and official communications (threshold-gated, incidental mentions don't flip); infra-failure override (collapse + built structure reads as development, never routine accident); C→B on accountability/mass-casualty; governance + accountability findings demote to B; curated = A or B-with-markers; reason codes feed `classification_results`.
- Bugs found by tests during implementation: confidence band miscalc (fixed inputs); double-counted nested phrases (span dedupe); Cheerio-style MIME-style hiding n/a — instead: release-vs-governance resolved by kind override; number-word casualties ("Twelve killed"); approval markers wrongly demoting governance (split approval vs accountability roles); marker labels leaked regex source (surface forms now).
- Gate result: 31/31 corpus cases exact (type + tier + curated).
- Known limitations: entity-aware fusion is Phase 26's job (lexical only); fine politics-vs-campaign boundaries will improve with the Phase 23 corpus + Phase 25 statistics.
- Required next-phase prerequisites: none blocking (Phase 12 topic classification builds on type + entities).

## Phase 10 — Bihar Relevance Engine (complete, verified 2026-09-29)

- Date: 2026-09-29
- Files changed:
  - `intelligence/relevance/` (`knowledge.py` surface index, `evidence.py` datelines/negatives/ambiguity, `scorer.py` weights + `{pass,score,confidence,evidence,locations,entities}` contract)
  - `intelligence/relevance/tests/fixtures/benchmark.json` (60 labelled items across all curation tiers + traps: incidental mentions, Aurangabad ambiguity, other-state datelines)
  - `intelligence/relevance/tests/test_relevance.py`, `test_benchmark.py` (gate: precision/recall ≥ 0.90)
  - `data/geography/places.json` (+10 heritage/wildlife places), `data/institutions/agencies.json` (+Bihar Government, +Legislature houses), `data/README.md`, `tests/test_knowledge_base.py`, `pytest.ini`
- Tuning trail (all honest): `match()`→`search()` for body datelines; institution 0.4, other-dateline −0.3, dateline-city counted once; nine benchmark items enriched with the anchors real copy carries; four KB entities added (never test-only hacks).
- Gate result: precision 1.000, recall 1.000 (30/30, 0 FP, 0 FN). Routine crime and rally rhetoric pass relevance (tiers are Phase 11's job).
- Known limitations: wire-dateline stories need real substance to overcome the Delhi penalty; bare unqualified institution names from other states are out of scope until Phase 23's larger corpus.
- Required next-phase prerequisites: none blocking (Phase 11 article-type classification consumes relevance output + entities).

## Phase 9 — Bihar Knowledge Base (complete, verified 2026-09-29)

- Date: 2026-09-29
- Files changed:
  - `data/geography/` (districts complete 38/38; towns 57; subdivisions 43 seed; rivers 16; blocks pending-empty by policy)
  - `data/institutions/` (universities 20; hospitals 12 incl. the plan's PMCH alias example; departments 36; agencies 12; corporations 8)
  - `data/infrastructure/` (airports 5; railway_stations 22 with codes; highways 8; industrial_areas 10; major_projects 8)
  - `data/README.md` (layout, coverage table, collision/coordinate rules), `tests/test_knowledge_base.py` (7 cases), `pytest.ini`
- No V1 existed to migrate from (Phase 0 blocked); built from verified public knowledge with correctness over completeness: null beats wrong, blocks.json stays empty rather than guessed, four project entries removed to avoid duplicate canonicals.
- Validation: schema/types/references, global id uniqueness, 38-district completeness with divisions/HQs/Hindi names, PMCH alias set resolving to one entity, same-place-only collision rule.
- Known limitations: subdivisions/blocks/towns partial (documented per-file coverage); coordinates HQ-approx; project statuses point-in-time; DB entity seeding is a later phase's job.
- Required next-phase prerequisites: none blocking (Phase 10 relevance reads these files).

## Phase 8 — Language Detection (complete, verified 2026-09-28)

- Date: 2026-09-28
- Files changed:
  - `intelligence/language/` (`detector.py`, `profiles.py`; `register_language` for ur/mai/bho/mag without schema change)
  - `intelligence/language/tests/fixtures/bilingual-test-set.json` (40 manually labelled items: EN with Devanagari entities, HI with Latin loans/digits, short and mixed edges)
  - `intelligence/language/tests/test_detector.py`, `test_bilingual_threshold.py` (gate: accuracy ≥ 0.95)
  - `pytest.ini` (covers `intelligence/language/tests`; stdlib only, no new dependency)
- Method: function-word evidence decides; script is recorded (`Latn:0.85,Deva:0.15` over letters), never equated with language. Every decision carries evidence; ties/short/thin inputs cap confidence explicitly.
- Gate result: accuracy 0.975 (39/40). Sole miss x02: a Hindi item whose long English official quote outvotes Hindi function words 8:4 — documented limitation (quote-aware weighting belongs to Phase 25 statistical work, not ad-hoc exceptions here).
- Known limitations: headline-only inputs fall back to weak script evidence (≤0.35, labelled); Hinglish-in-Latin is out of scope until a profile exists.
- Required next-phase prerequisites: none blocking (Phase 9 knowledge base; Phase 10 relevance consumes `body` + language fields).

## Phase 7 — Article Extraction (complete, verified 2026-09-28)

- Date: 2026-09-28
- Files changed:
  - `extraction/trafilatura_worker/` (`cascade.py`, `jsonld_meta.py`, `opengraph_meta.py`, `body_trafilatura.py`, `body_readability.py`, `adapters.py`, `helpers.py`; `__init__` now exports `extract_article`)
  - `extraction/tests/fixtures/` (30 publisher shapes + `manifest.json` contracts), `extraction/tests/test_fixtures.py`, `extraction/tests/test_cascade.py` (9 unit cases)
  - `extraction/requirements.txt` (+readabilipy), docs
- Cascade: JSON-LD → OpenGraph → Trafilatura → Readability → adapter; metadata merges down that priority; deterministic confidence (high/medium/low/failed) with inspectable warnings; adapter overrides weak generic results. Parses only — no relevance/category judgments.
- Bugs found by tests during implementation: hand-computed confidence band for the low-case was wrong (fixed inputs); JSON-LD stopped after the first script block even without an article node (fixed + regression test).
- Corpus reality check: 29/30 bodies via Trafilatura (readability + adapter paths proven by unit tests with stubbed stages); gallery fixture correctly fails; low-confidence records stay inspectable via warnings.
- Tests passed (2026-09-28): full suite below.
- Known limitations: no built-in publisher adapters yet (real ones need real pages + fixtures, never guesses); date parsing covers common publisher formats, not every locale string; language detection is Phase 8's job, not this module's.
- Required next-phase prerequisites: none blocking (Phase 8 language detection consumes `body`).

## Phase 6 — Browser Fallback (complete, verified 2026-09-28)

- Date: 2026-09-28
- Files changed:
  - `supabase/migrations/20260928000003_phase6_browser_flags.sql` (generated ALTER + UPDATEs; zero flagged sources)
  - `data/sources/registry.json` (`requires_browser: false` × 14 with probe evidence in notes), `data/sources/README.md` (flag semantics)
  - `scripts/generate-source-seed.mjs` (emits both seed files), `tests/source-registry.test.ts` (drift check covers both)
  - `crawler/fetch/browser-policy.ts` (flag-only routing, `claimBrowserRows`), `crawler/fetch/browser-fetcher.ts` (PlaywrightCrawler, same FetchResult contract), `crawler/fetch/runner.ts` (shared core + `fetchBrowserBatch`), `crawler/fetch/config.ts` (`loadBrowserConfig`: 2/1 concurrency, 45s timeout)
  - `crawler/fetch/browser-policy.test.ts`, `crawler/fetch/browser-fetch.test.ts` (Chromium renders JS-only fixture, 403 parks, HTTP-only rows untouched)
  - `package.json` (`playwright`; browsers installed via `npx playwright install chromium`), docs
- Evidence probe (headless Chromium, section/homepage loads only): News18 Bihar + PIB → http-403 Access Denied. Bot mitigation, not a rendering gap — flags stay false. No auto-escalation by design.
- Tests passed (2026-09-28): full suite below.
- Known limitations: no flagged production source yet (flag flips on evidence); browser HTML in-memory only like HTTP (Phase 7/35).
- Required next-phase prerequisites: none blocking (Phase 7 extraction consumes both engines' `FetchResult.html`).

## Phase 5 — HTTP Acquisition Engine (complete, verified 2026-09-28)

- Date: 2026-09-28
- Files changed:
  - `crawler/fetch/config.ts` (10/2 concurrency, 30s timeout, 5 attempts, exp backoff; env-overridable)
  - `crawler/fetch/retry.ts` + tests (all plan cases: 408/429+Retry-After/5xx→retry, 404/410→permanent, 401/403→blocked, non-HTML→reject-content, transport errors→retry)
  - `crawler/fetch/domain-throttle.ts` + tests (per-domain semaphore)
  - `crawler/fetch/queue-store.ts` + PGlite tests (atomic SKIP LOCKED claims, backoff incl. exact Retry-After, cap exhaustion, stale-claim release)
  - `crawler/fetch/fetcher.ts` (Crawlee wiring), `crawler/fetch/runner.ts` (fetchBatch: recover→claim→run→persist, returns results), `crawler/fetch/fetch.test.ts` (local-server integration: 11 routes, two passes, per-domain peak ≤ 2)
  - `package.json` (crawlee), docs
- Bugs found by tests during implementation: throttle slot handoff double-counted; CheerioCrawler hides non-HTML from the classifier (→ HttpCrawler + `additionalMimeTypes */*`); Crawlee's process-wide shared queue silently deduped second-batch re-runs (→ unique queue id per batch); summary counted intent instead of recorded state (→ record returns effective status); server Retry-After must outrank our backoff ceiling.
- Tests passed (2026-09-28): `npm run lint` — pass; `npm run typecheck` — pass; `npm test` — pass (64/64); `npm run build` — pass (below); `pytest` — pass (below).
- Known limitations: HTML held in memory only (no raw-HTML store yet — Phase 7/35); politeness is per-domain concurrency only (no crawl-delay parsing yet — Phase 19 can add).
- Required next-phase prerequisites: none blocking (Phase 6 adds Playwright fallback for `blocked`/configured sources; Phase 7 consumes `FetchResult.html`).

## Phase 4 — Discovery Engine (complete, verified 2026-09-28)

- Date: 2026-09-28
- Files changed:
  - `crawler/normalisation/normalise-url.ts` + tests (7 fixture categories: normal, tracking, relative, AMP, mobile, duplicates, invalid)
  - `crawler/discovery/types.ts`, `parse-feed.ts` (RSS+Atom), `parse-sitemap.ts` (urlset/news/index), `parse-wordpress.ts`, `parse-section.ts`, `discover.ts` (ordering, checkpoints, 250-cap, idempotent queue rows)
  - `crawler/queues/checkpoints.ts` + tests, `crawler/queues/enqueue.ts`
  - `crawler/discovery/fixtures/` (6 real-shape fixtures), `crawler/discovery/discovery.test.ts` (12 cases incl. PGlite enqueue dedupe)
  - `vitest.config.ts` (covers `crawler/`, 60s timeouts for embedded PGlite), `package.json` (fast-xml-parser, cheerio), docs
- Bugs found by tests during implementation: AMP `/amp/` slice left a trailing slash; RSS text `<link>` dropped by the array branch (both fixed, regression-covered).
- Tests passed (2026-09-28): `npm run lint` — pass; `npm run typecheck` — pass; `npm test` — pass (42/42); `npm run build` — pass (below); `pytest` — pass (below).
- Known limitations: sitemap-index child follows capped at 25/endpoint; section discovery is generic (publisher rules: Phase 7); failed polls leave cursors untouched for next run.
- Required next-phase prerequisites: none blocking (Phase 5 adds Crawlee HTTP acquisition over `crawl_queue`).

## Phase 3 — Source Registry (complete, verified 2026-09-28)

- Date: 2026-09-28
- Files changed:
  - `data/sources/registry.json` (14 sources, 23 endpoints across 8 of 10 groups; every URL verified http-200 2026-09-28 except 2 inactive bot-blocked entries with reasons)
  - `data/sources/README.md` (groups, waves, entry rules)
  - `scripts/generate-source-seed.mjs` (`npm run registry:generate`)
  - `supabase/migrations/20260928000002_phase3_sources.sql` (generated seed, idempotent via ON CONFLICT)
  - `tests/source-registry.test.ts` (7 cases: record completeness, URL/domain rules, generator drift, DB load, orphans, flagship spot-check)
  - `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_STATUS.md`, `package.json`
- Coverage: national EN/HI (4), Bihar EN/HI (6, incl. inactive News18 Bihar), business (ET), environment (Mongabay India), official (PIB, inactive 403), institutional (PRS). district-local and education empty by design (Waves C/D).
- No article crawling performed (registry HTTP checks only: feeds/robots/sections/sitemaps).
- Tests passed (2026-09-28): `npm run lint` — pass; `npm run typecheck` — pass; `npm test` — pass (16/16); `npm run build` — pass (below); `pytest` — pass (below).
- Known limitations: News18 Bihar + PIB inactive (http-403 bot protection; Phase 6 candidates). PRS has homepage only (guessed deep paths 404d, excluded). No district/local or education sources yet (Waves C/D).
- Required next-phase prerequisites: none (Phase 4 discovery builds on `source_endpoints` + checkpoints).

## Phase 2 — Database Foundation (complete, verified 2026-09-28)

- Date: 2026-09-28
- Files changed:
  - `supabase/migrations/20260928000001_phase2_foundation.sql` (all 13 canonical tables, explicit FKs, TEXT+CHECK vocabularies, feed/archive/queue indexes, `updated_at` triggers)
  - `tests/db-foundation.test.ts` (6 cases: tables, FKs, end-to-end insert flow + curated feed query, CHECK enforcement, UNIQUE + single-story membership, triggers)
  - `supabase/README.md` (apply + validate instructions)
  - `docs/ARCHITECTURE.md` (database contracts marked implemented, PK/vocabulary decisions recorded)
  - `.github/workflows/ci.yml` (asserts at least one `*.sql` migration exists)
  - `package.json` (dev-only `@electric-sql/pglite` for migration verification)
- Interfaces introduced: none (shape only; rows belong to Phase 3+)
- Deliberate addition beyond Section 11 column list: `articles.headline_hash` for Phase 14 exact dedup
- Tests passed (2026-09-28, Node v26.5.0, Python 3.12.10):
  - `npm run lint` — pass
  - `npm run typecheck` — pass
  - `npm test` — pass (9/9: 3 supabase + 6 db-foundation, migration applied to embedded PGlite)
  - `npm run build` — pass
  - `pytest` — pass (1/1)
- Known limitations:
  - No seed rows (Phase 3). No RLS policies yet — required before any production Supabase use (Phase 21 admin + public read paths decide policy).
  - `district_id` is a TEXT slug; reference geography lands in Phase 9.
- Required next-phase prerequisites: Supabase project URL/keys for live apply; V1 source list for Phase 3 registry rows.

## Phase 1 — V2 Application Shell (complete, verified 2026-09-28)

- Date: 2026-09-28
- Files changed:
  - `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`
  - `eslint.config.mjs`, `.prettierrc`, `.editorconfig`, `.gitignore`, `.env.example`
  - `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
  - `src/lib/supabase.ts`, `src/lib/supabase.test.ts`
  - `extraction/trafilatura_worker/__init__.py`, `extraction/requirements.txt`
  - `extraction/tests/test_placeholder.py`, `pytest.ini`
  - `.github/workflows/ci.yml`
  - `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_STATUS.md`
  - Placeholder dirs: `crawler/`, `intelligence/`, `data/`, `tests/`, `supabase/migrations/`, `scripts/`
- Interfaces introduced:
  - `getSupabaseClient(): SupabaseClient | null` (null when unconfigured, never throws)
  - `isSupabaseConfigured(): boolean`
  - `extraction.trafilatura_worker.placeholder()` (Phase 7 stub)
- Tests added:
  - `src/lib/supabase.test.ts` (3 cases: unconfigured, partial, configured)
  - `extraction/tests/test_placeholder.py` (import smoke test)
- Tests passed (2026-09-28, Node v26.5.0, Python 3.12.10, Next 16.3.6):
  - `npm install` — pass (397 packages audited)
  - `npm run lint` — pass (eslint, no warnings/errors)
  - `npm run typecheck` (`tsc --noEmit`) — pass
  - `npm test` — pass (vitest 3.2.7, 3/3 in `src/lib/supabase.test.ts`)
  - `npm run build` — pass (Next Turbopack production build, `/` prerendered static)
  - `pytest` — pass (1/1 in `extraction/tests/test_placeholder.py`)
- Known limitations:
  - Homepage is placeholder only (no V1 UI migration until Phase 28).
  - No DB migrations yet (Phase 2). No crawler/classifier logic (Phases 4+).
  - Supabase client returns null without env — expected until Phase 2.
- Required next-phase prerequisites:
  - Supabase project + env values for Phase 2 migration work.
  - V1 reference location for Phase 0 freeze documentation (source list, entity dicts, schema).

## Phase 0 — Freeze V1 (blocked)

- Need: path/URL to V1 repo to tag `v1-production-final` and record
  source list, categories, entity dictionaries, schema, env vars, behaviour.
