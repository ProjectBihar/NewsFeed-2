# Architecture (V2)

Source of truth: `PROJECTBIHAR_NEWSFEED_V2_MASTER_PLAN (1).md`.
This file records subsystem ownership and dependency rules for implementers.
Phase 1 shell only — later phases extend this document, never contradict it.

## Pipeline order (normative)

```text
Source registry
→ Discovery (RSS/Atom/sitemap/WP API/section)
→ URL normaliser → Request queue
→ HTTP acquisition (Crawlee) → Browser fallback (Playwright, opt-in only)
→ Extraction (Trafilatura → Readability → adapter)
→ Validation → Language detection
→ Bihar relevance → Entity resolution
→ Article type → Topic + event classification
→ Exact dedup → Near-duplicate → Story clustering
→ Database → Public website + Admin observatory
```

## Subsystem contracts

### Discovery (`crawler/discovery/`, `crawler/normalisation/`, `crawler/queues/`)

- MAY identify and normalise URLs, maintain endpoint checkpoints.
- MAY NOT fetch article bodies, classify content, or decide Bihar relevance.

### Acquisition (`crawler/fetch/`, `crawler/adapters/`, `crawler/health/`)

- MAY download resources, record HTTP status/final URL/content-type/timing.
- MAY NOT parse article semantics or classify.

### Extraction (`extraction/`)

- MAY parse HTML into title/description/body/author/date/canonical/confidence.
- MAY NOT decide Bihar relevance or category.
- Phase 7 implemented: cascade JSON-LD → OpenGraph → Trafilatura → Readability (readabilipy) → domain adapter; deterministic confidence (high/medium/low/failed); 30-publisher fixture corpus in `extraction/tests/fixtures/`; adapters registered per-domain, never guessed.

### Retention (`crawler/retention/` — Phase 35)

- MAY store the two temporary payloads the plan lists (raw HTML, extracted article body) in `temp_documents` with a fixed expiry, and delete temporary rows whose expiry has passed.
- MUST NOT write or delete permanent archive metadata (URLs, headlines, descriptions, publication metadata, hashes/fingerprints, entities, locations, classification, story relationships, diagnostic scores) — retention's blast radius is `temp_documents` alone, asserted by table snapshots in the gate.
- Exempt rows (`keep_reason` = regression fixture / manual review / debugging) carry `expires_at = NULL` and are never auto-deleted; the public site and the archive reads never touch this table.

### Language (`intelligence/` — Phase 8)

- MAY output language / confidence / script_mix.
- MAY NOT equate script with language.
- Phase 8 implemented: deterministic function-word scoring with script recording (`intelligence/language/`); new languages register as profiles, no schema change.

### Bihar relevance (Phase 10)

- MAY output pass/score/confidence/evidence/locations/entities.
- MAY NOT classify topic or event type. Never return bare boolean.
- Reads `data/geography|institutions|infrastructure/*.json` (Phase 9: 38 districts complete, rest seeded; blocks pending). Same-place facet collisions (town/subdivision/station/district) disambiguated by context, never by guessing.
- Phase 10 implemented (`intelligence/relevance/`): weighted evidence families with per-family caps, threshold 0.5, other-state dateline/city negatives, ambiguous-name quarantine (Aurangabad/Rohtas need Bihar corroboration), benchmark precision/recall gate.

### Classification (Phases 11–13)

- MAY output article_type / primary_category + secondary_topics / event_type.
- MAY NOT fetch websites or alter queue state.
- Phase 11 implemented (`intelligence/classification/`): 17-type bilingual lexicon with span-aware scoring (no double count), kind overrides (advertorial, official release), A/B/C/D significance with consequence markers, curated = A or selected B; reason codes preserved for `classification_results`.
- Phase 12 implemented (`subtopics.py`, `topic.py`): 8 public categories, ~40 EN+HI subtopics; primary by aggregate score with an honest None fallback (never forced); secondary top-4 ≥ threshold; secondaries ride in reason codes.
- Phase 13 implemented (`events.py`): 22-event bilingual vocabulary (announcement→crime); winner-take-all with a None fallback for event-less items (documented disaster-relief gap); reason codes preserved.

### Dedup (Phase 14) / Near-duplicate (Phase 15) / Clustering (Phases 16–17)

- MAY collapse technical duplicates, score similarity, group stories.
- MAY NOT reclassify article semantics to force a merge.
- Phase 14 implemented (`intelligence/dedup/`): canonical → content-hash → same-source-headline rules; cross-publisher headline matches never collapse (Phase 16's job).
- Phase 15 implemented (same package): recall-first MinHash LSH (64x2) + blocking (72h window, place/entity overlap, category-event compatibility) + unigram-cosine confirmation (0.6); SimHash observed. Templates die in blocking because bag similarity cannot separate shared skeletons from shared facts.
- Phase 16 implemented (`intelligence/clustering/`): provisional plan weights (30/20/20/15/10/5) + shared-number bonus, 0.6 threshold, 7-day window, single-linkage batch + best-match assignment; pair scores feed `story_articles.cluster_score`.
- Phase 17 implemented (`xlingual.py`): mechanical Devanagari→Latin transliteration with approximate bridge matching (no embeddings); bridges become shared entity evidence in the same 0.6 scorer; Devanagari digits fold for number overlap; specified-but-disjoint districts penalize (same crime pattern, different places).
- Phase 18 implemented (`titles.py`): deterministic headline selection (entity coverage, event signal, clickbait penalty, conciseness, completeness, source/confidence quality) with admin override; canonical titles stay data, never generated prose.

### Presentation (`src/app/(public)/`, `src/components/public/` - Phase 28-34)

- MAY render stories/articles from the database.
- MAY NOT run crawler or classifier logic. No reader auth (Phase 2.2).
- Phase 28 implemented: V1 visual system migrated verbatim (`(public)/public.css` copied from `PBNews/src/app/globals.css` — tokens, glass components, fonts, animations, responsive rules) with Tailwind v4 utilities; sticky glass `Header` (count pill optional — the story page has no feed total — + refresh + dark toggle only), `CategoryTabs` pill strip, `StoryCard` (V2 story shape in the V1 card: badge, canonical title, district · time, sources · languages), `Newsfeed` shell (1200px container, 1/2/3-column grid, header count follows the active category).
- Phase 29 implemented: section nav (`SiteNav` — `Latest` (`/`), `Topics` (`#topics`, enters Curated then scrolls), and (Phases 31-33) `Districts` (`/district` index), `Sources` (`/source` index) and `Archive` (`/archive`, server-paginated) live — all five nav items are real routes since Phase 33, no disabled placeholders remain; demo mode carries `?demo=1` through nav/back links) and feed modes (`FeedSwitcher` + `feed-modes.ts`): default **Curated** = plan §54 tier A + selected B, **All Bihar News** = A + B + C; counts shown on the switcher; category pills filter within Curated only (V1 behaviour — hidden in All mode); cards carry no needless synopsis (asserted). Responsive gate: `npm run check:responsive` (Playwright, 39 checks at 1280/768/375 — 3/2/1 columns, Curated 9 → All 12 on the fixture, nav/switcher state, link checks for Districts, Sources and Archive with zero disabled placeholders, no horizontal overflow, no page errors).
- Phase 30 implemented: story page at `/story/[id]` (route param accepts fixture ids with `?demo=1` and numeric live ids). Shows the plan's eight facts (canonical headline as `h1` with generateMetadata title, primary category badge, event type, district, first reported, latest update, source count, language coverage), a **Reports** section (one row per member article in first-reported order — source name linking to the original publisher's article URL live / registry homepage for demo stories, `target="_blank" rel="noopener noreferrer"`, always stamped in Bihar time via `formatStamp`), and an **Entities** section (distinct names, mention-count order; hidden when empty). Article bodies are never fetched or rendered (copyright rule, asserted). Headlines on the feed card now link to the story page, carrying `?demo=1` in demo mode; unknown ids → 404 (unconfigured database honestly has no stories). Gate: `story.test.ts` (13) cross-checks every demo report/entity against the Phase 16 fixture file and the publisher links against the registry; `render.test.tsx` (15) covers page rendering, 404s, links, and metadata.
- Tailwind (incl. preflight) is imported **only** by `(public)/public.css`; admin CSS styles its own interactive elements from browser defaults, so a global import would restyle the observatory. The gate asserts the single-import invariant; root body rules live in `admin/admin.css`.
- Feed reads (`src/lib/public/feed.ts`): `stories` table when Supabase is configured, with embedded `story_articles(articles(curated,language))` supplying per-story facts — `curated` = any member article curated (drives the Curated mode), `languages` = deduped member-article coverage for the card's `EN + HI`; otherwise an honest empty result with an on-page notice (public counterpart of the admin ConfigNote). `?demo=1` serves `demo-stories.ts` — 12 stories derived from the reviewed Phase 16 benchmark partition, `curated` flags derived from their tiers (9 curated) — behind a visible notice; demo data never mixes into the live feed.
- Story detail reads (`src/lib/public/story.ts`): live path embeds `story_articles(articles(id,canonical_url,published_at,language,sources(name,domain)))` plus a second query for `article_entities` → `entities`; demo path serves `demo-story-details.ts` (fixture-derived entities + registry publishers) — both under the same `StoryDetail` contract, with null → 404.
- District archives (Phase 31): routes `/district` (index of the canonical 38-district list from `data/geography/districts.json`, navigation only — no statistics of its own) and `/district/[slug]` (unknown slug → 404 from real geography). Reads (`src/lib/public/district.ts`) span two real geography fields: recent stories from `stories.district_id` (story geography, newest activity first, cap 60) and latest developments + source coverage from `articles.district_id` (article geography, newest reports first, coverage over the sampled window, cap 100). Sections: latest developments (headline → original publisher when the URL is known; the demo fixture carries no article URLs so headlines stay unlinked), recent stories (`StoryCard` grid), topic distribution (category counts over the fetched stories, uncategorised bucket included, proportional bars), source coverage (distinct sources over the sampled articles). Both distributions display their sample sizes; a district with no data renders an honest empty state and no statistic sections at all. Demo (`demo-articles.ts` — the 21-article fixture corpus with per-article districts, cross-checked field-by-field against the Phase 16 fixture file) filters stories by district name and articles by district slug; internal navigation (nav, back links, story Location facts, index links) carries `?demo=1` so the demo context is never dropped.
- Source archives (Phase 32): routes `/source` (index of the 12 active registry sources from `data/sources/registry.json` — navigation only, inactive entries unlisted) and `/source/[slug]` (unknown, inactive, or internal fixture slug → 404). Slugs derive deterministically from registry names (`"The Hindu"` → `the-hindu` — the plan's example URL), so demo and live URLs always agree and stay independent of database state: every active source has one stable public page (gate). Public fields per the plan — source name (linked to the registry-verified homepage), language, scope, source type, recent Bihar coverage, latest stories/articles; crawler diagnostics (endpoints, verification, priority, wave, notes, requires_browser) never cross the border (asserted against the registry file — no endpoint URL or note renders publicly). Reads (`src/lib/public/source.ts`): demo filters the 21-article fixture corpus through `demoPublisher` name resolution (a fixture alias like `toi` resolves the registry page `times-of-india-patna`; fixture-only sources such as Business Standard have no page — no guessed routes); live joins `articles.source_id` via `sources!inner(name)` (cap 100) and derives member stories. Coverage counts (articles/stories/districts) carry their sample size; zero-data sources render the honest empty state and no statistic sections. District archive source-coverage rows now link into these pages; nav `Sources` is live (`?demo=1` carried).
- Archive (Phase 33): route `/archive` with server-side pagination and date-based queries (`/archive?year=2026&month=09` — plan example) — replaces V1's latest-200 limitation (`PBNews/src/app/page.tsx` fetches `.limit(200)`); per the plan the browser never receives the full archive. Reads (`src/lib/public/archive.ts`): stories ordered by first-reported time with an id tiebreak (a story belongs to exactly one month; month boundaries computed in IST `+05:30` to match every stored stamp); demo serves the 12-story fixture through the same `paginate` window function (8 per page → two pages, so the fixture genuinely exercises page 2); live fetches a PostgREST `.range()` window with an exact count (20 per page — one query in the common case, a clamped refetch only for hand-made out-of-range pages), backed by migration `20260930000001_phase33_archive_index.sql` (`idx_stories_first_seen (first_seen_at DESC, id DESC)` — matches the ORDER BY exactly so both the date predicate and the ordering stay index-backed as history grows). Query parsing is strict: syntactically valid dates render (an honest empty month is a valid answer), malformed values (`year=abc`, `month=13`, `page=0`, month-without-year, repeated params) 404 instead of guessing; the filter form's year input is `required`, so a month can never be submitted without one. Pagination is plain server-rendered links preserving `year/month/page/demo` (no client fetching); nav `Archive` is live, completing the plan's five-item section nav. The feed keeps its 60-story latest window — the archive is the paginated browse surface. Gate: `archive.test.ts` (8) — a 10,000-story synthetic archive windows in bounded time (<50 ms) and never returns more than the page size (the "large counts remain performant" gate), plus fixture pagination, exact month bucketing (cross-checked: every archive date equals the story's earliest member article), strict parsing, and honest unconfigured-live behavior; `render.test.tsx` (7 new — windows, links, form round-trip, empty state, 404s, live notice, metadata).
- Search (Phase 34): route `/search?q=&district=&category=&type=&event=&source=&language=&year=&page=` — plan decision "Provide useful archive search without introducing Elasticsearch. Use PostgreSQL search capabilities first." No new infrastructure: one PostgREST RPC `search_story_ids` (migration `20260930000002_phase34_search.sql`) executes the entire search inside PostgreSQL and returns `{ total, ids }` — an exact count plus at most `p_limit` ids (SQL `LEAST(…, 100)` hard cap), so the browser never receives an archive-scale result set; ids hydrate through the shared `STORY_SELECT` and are re-ordered to the SQL rank. Matching: case-insensitive substring tokens with AND semantics over the plan's field list (story titles, article headlines, entity names, district slugs, category labels, source names + domains), normalised by `search_norm` (lowercase, `-`/`_` → space) and LIKE-escaped by `search_token_pattern` so `%`/`_` typed by a reader are literal; filters are the plan's list (year window in IST, district, category, article type, event, source, language) where article-side facts resolve through the story's member articles — identical semantics on the demo path, which runs the same parse/match/rank/paginate logic in-process over the 12-story fixture (`src/lib/public/search.ts`). Ranking: stories whose headline contains every token first, then first-reported time, then id — the same deterministic order in SQL and demo. Evaluation is set-based, not per-row probes: each field is one whole-table scan branch unioned into per-token story hits counted per story (the correlated-EXISTS draft cost ~61k buffer touches / ~5.5 s on the 3,000-story seed; the set-based shape runs in ~120 ms — archive-scale gate `tests/search-fn.test.ts`, PGlite applying all migrations, asserts branch recall, exact counts at scale, disjoint page windows, the ≤100-id cap, and a <1,500 ms wall clock). Query parsing is strict (unknown/inactive/oversized/repeated values → 404); empty criteria render a browse state (all fixture stories, one window, plus a prompt) rather than an unfiltered search; the date filter is year-only (month browsing is `/archive`'s job, which keeps the month-without-year 404 trap out of `/search`); the fixture carries no article-type labels so that filter honestly matches nothing with an explicit note in the empty state; entry point is the "Search the archive →" link on `/archive` (the section nav stays the plan's five items — V1 has no search UI). Gates: `search.test.ts` (6 — parse matrix, every field/filter, pagination, live honesty), `search-live.test.ts` (3 — RPC argument shaping, SQL-rank restoration, clamp + error propagation), `render.test.tsx` (7 new — prompt, ranking order, round-trips, empty state, 404s ×10, live notice, metadata).
- Removed per plan and asserted absent by test: login, logout, reader session checks, avatar, sentiment buttons, personal recommendation prediction, public block-phrase controls. Dark mode = `.dark` class store via `useSyncExternalStore` (localStorage preference, OS default, no hydration mismatch).

### Admin (`src/app/admin/` — Phase 21+)

- MAY show health/queues/corrections; protected route.
- MAY NOT be reachable without auth. Public site stays open.
- Phase 21 implemented: read-only diagnostics (overview, sources, runs, queue, low-confidence, stories, corrections) behind Basic Auth guard (`src/proxy.ts` — Next 16 renamed middleware to proxy, and the file must live in `src/` when it exists; root `middleware.ts` is silently ignored), WebCrypto constant-time, all pages force-dynamic with unconfigured-DB messaging; shaping helpers unit-tested, queries thin.
- Phase 22 implemented (`mutations.ts` + story detail page): field corrections (type/category/event/district/relevance/entities-audit), rename/move/merge/split with recounts; every write appends `admin_corrections` (old/new/version/reason); history never overwritten.

## Dependency rules

- `src/` depends on Supabase client only; never imports `crawler/`, `intelligence/`, or `extraction/`.
- `crawler/` never imports `intelligence/` classification.
- `intelligence/` never performs network fetch.
- Adding a dependency requires: stdlib inadequate + actively maintained + licence-compatible + removes substantial custom code.
- Prohibited premature infra: Kubernetes, Kafka, RabbitMQ, Celery, Redis, Elasticsearch, GraphQL, microservices, Docker Swarm, vector DB, hosted orchestrator.
- No paid LLM/API dependency. No local LLM requirement. Core works offline of any model.

## Database contracts (Phase 2 implemented)

- All schema changes via versioned `supabase/migrations/`. No dashboard-only changes.
- Canonical tables: sources, source_endpoints, crawl_runs, crawl_queue, articles, stories, story_articles, entities, entity_aliases, article_entities, source_health, classification_results, admin_corrections; plus temp_documents (Phase 35 — the only non-permanent table).
- PKs are BIGINT identity (no extension needed; applies to stock Postgres, Supabase, PGlite).
- Extensible vocabularies use TEXT + CHECK, never ENUM. Taxonomies owned by Phases 11–13 stay unconstrained TEXT.
- `district_id` is a TEXT slug (reference geography lands in Phase 9).
- `articles.headline_hash` added for Phase 14 exact dedup. Full bodies are never stored in permanent tables: raw HTML and extracted bodies live only in `temp_documents` and expire after 10 days (Phase 35 retention).
- Fresh DB builds entirely from migrations; `tests/db-foundation.test.ts` applies them to embedded PGlite and checks tables, keys, indexes, and an end-to-end insert flow.

## Source registry (Phase 3 implemented)

- Canonical catalogue: `data/sources/registry.json` (DB holds rows, JSON holds truth).
- Seed migration `20260928000002_phase3_sources.sql` is generated by `npm run registry:generate`; never hand-edit. Drift test enforces sync.
- Groups: national-english/hindi, bihar-english/hindi, district-local, business, environment, education, official, institutional. Waves A–D; district-local and education intentionally empty until Waves C/D.
- `active: true` requires http-200 verification evidence with the expected content type. Blocked sources register inactive with a reason (browser-fallback candidates, Phase 6).

## Discovery (Phase 4 implemented)

- Order: RSS → Atom → news sitemap → sitemap → WordPress API → section. First channel wins on cross-channel duplicates.
- Checkpoints per endpoint (`last_seen_url`, `last_seen_published_at`, always `last_success_at` on success). Cap: 250/source/run; on cap the cursor anchors the oldest queued entry so the remainder is re-walked (DB `ON CONFLICT` makes re-walks idempotent).
- Normalisation strips tracking params, fragments, AMP forms, default ports; sorts surviving params; lowercases hosts. Mobile subdomains intentionally preserved (no destructive cross-host mapping).
- Sitemap indexes followed one level, same-origin only. Section parsing is generic same-domain links; publisher rules belong to Phase 7.
- Code: `crawler/discovery/` (parsers + `discover.ts`), `crawler/normalisation/`, `crawler/queues/` (checkpoints, idempotent enqueue). No article fetch, no classification.

## Acquisition (Phase 5 implemented)

- Crawlee `HttpCrawler` (global pool 10, per-domain throttle 2 in pre-navigation hooks). Internal retries off; retries live in `crawl_queue` with exponential backoff, so they survive restarts.
- Every HTTP response reaches our classifier (`ignoreHttpErrorStatusCodes` + `additionalMimeTypes: */*` bypass Crawlee's MIME gate). Outcomes: success / retry (408, 429 with Retry-After honoured exactly, 5xx, timeouts, DNS) / permanent (404, 410, other 4xx) / blocked (401, 403 parked separately) / reject-content (non-HTML terminal, not failure).
- Durability: atomic `SKIP LOCKED` claims, stale-claim release (crash recovery), safety net re-queues outcome-less rows, fresh Crawlee queue id per batch (shared in-memory storage would otherwise dedupe re-runs). Runner returns results for the Phase 7 handoff; on every success it also copies the response HTML into temporary storage (`temp_documents`, 10-day expiry — Phase 35) after the queue outcome is durable, best-effort with `tempStored`/`tempStoreFailed` counters so storage trouble never corrupts queue state.

## Browser fallback (Phase 6 implemented)

- Opt-in per source via `sources.requires_browser` (migration 0003, generated from registry). Policy is flag-only: failures never auto-escalate.
- Playwright through Crawlee, same FetchResult contract, concurrency 2/1, 45s timeout. Only flagged rows are claimed; HTTP-friendly sources stay HTTP-only.
- Evidence 2026-09-28: News18 Bihar + PIB are 403 even in real Chromium (bot mitigation, not rendering) — all 14 flags stay false. Capability proven against a JS-rendered fixture instead.

## Source health (Phase 19 implemented)

- One state per source (HEALTHY/DEGRADED/BROKEN/STALE/BLOCKED) with reasons, derived from `crawl_queue` outcomes + `source_endpoints` freshness into `source_health`.
- Order decides meaning: BLOCKED (403 dominance) before BROKEN (failing polls/fetches) before STALE (quiet-but-working vs never-tried). Timestamps normalized once (PGlite Dates vs REST strings).
- Extraction observability sleeps until a runner writes `extracted` rows; per-endpoint poll counters are a future schema addition if freshness math needs them.
- Phase 20 implemented (`drift.ts`): rolling-median baselines, `DISCOVERY_VOLUME_ANOMALY` (zero-drop critical, collapse warning), `PARSER_DRIFT_SUSPECTED` (0.75→0.5 with drop ≥ 0.3); alerts persist in `source_health.diagnostics`; `checkSourceHealth` composes metrics→assess→drift→record.

## Evaluation (Phase 23 implemented)

- Permanent corpus: `evaluation/corpus.json` indexes 10 component sets (~320 labelled units); `evaluation/run.py` computes all required metrics; `evaluation/report.json` is the committed output.
- Gate rule: same corpus in, same report out — fixture and report commit together, never apart. No quality claim without sample sizes attached.
- Phase 27 (retraining) compares candidates against this frozen corpus; admin corrections (Phase 22) are its future growth source.
- Phase 26 implemented (`models/hybrid.py` fusion + `models/decide.py` task adapters): agree→boosted confidence, disagree→rule default at low confidence with review, override only when statistics are sure (≥0.8) and rules unsure (≤0.45), abstentions never overridden; held-out gate proves no regressions.
- Phase 24 implemented (`tests/regression/*.json` + `tests/test_golden.py`): every historical failure pinned with its history; any behavior change fails loudly by design. TS-side regressions live in their unit tests.

## Statistical learning (Phase 25 implemented)

- Candidates: logistic regression / linear SVC (plain + balanced) on TF-IDF word (1,2) + character (3,5) n-grams; CPU-only, inexpensive.
- Measured, not deployed: stratified 5-fold (relevance) and leave-one-out (type/category) CV on the frozen corpora; winners recorded in `intelligence/models/report.json`; refit deterministically on demand. Deterministic rules stay production until Phase 27 data arrives.

## Model retraining (Phase 27 implemented)

- Controlled self-improvement in `intelligence/models/retrain.py`: triggers are weekly or 100 new reviewed corrections (correction count honestly `None` when no DB is configured — weekly still applies); no trigger means no training, no writes.
- Production = `report.json` `winner` per task; a fresh evaluation (`write_report`) pins existing winners verbatim and can never promote by itself — promotion happens only through `run_retraining`.
- Promotion bar (all must pass): challenger improves the CV mean by ≥ 0.01 over production on the frozen corpus, stays above the Phase 25 floor, fit ≥ 0.9, no per-class F1 drop > 0.15 on classes with support ≥ 2, and the Phase 26 hybrid gate still holds with the challenger seated (`models/evaluate.py::evaluate_task`).
- Every triggered run appends `intelligence/models/ledger.json`: model version (`winner@dataset-version`), training date, dataset version (sha256 of the frozen corpora), metrics (production vs challenger), and the promotion decision with reasons. First real cycle (2026-09-30): all three tasks **hold** — no challenger shows explicit improvement; production untouched.
- Completion gate: two full cycles produce identical metrics/decisions/dataset version (`tests/test_retrain.py`).

## Storage retention (Phase 35 implemented)

- Plan §44: keep the system within free database/storage limits. Permanent (URL, canonical URL, headline, publisher description, publication metadata, hashes/fingerprints, entities, locations, classification, story relationships, diagnostic scores) = the Phase 2 schema itself; retention writes to those tables never. Temporary (raw HTML, full extracted body) = `temp_documents` (migration `20261001000001_phase35_retention.sql`): one row per URL, `expires_at` fixed at first store to `now() + 10 days` (plan's recommended initial retention 7–14), partial index `idx_temp_documents_expires` so the cleanup scan only ever reads expirable rows.
- One lifetime state, CHECK-enforced (`temp_documents_lifetime_check`): automatic retention (`keep_reason` NULL + `expires_at` set) **XOR** exemption (`keep_reason` ∈ regression_fixture / manual_review / debugging — the plan's "longer only where needed" — with `expires_at` NULL). Neither-both (undeclared forever-retention) nor neither (hoarded without declaring why) can exist. `temp_documents_payload_check` forbids payload-less rows. `queue_id`/`article_id` are provenance links with `ON DELETE SET NULL`: expiry alone decides lifetime — a parent delete detaches, never deletes a within-retention document, never leaves an orphan.
- Ingress: `crawler/retention/temp-store.ts` `storeTempDocument` upserts by URL (provided payload fields win, omitted ones are kept, `expires_at`/`keep_reason` never touched — the window was set at first store) and accepts both plan payloads; the fetch runner (`crawler/fetch/runner.ts`) calls it for every successful response after its queue outcome is durable, best-effort with `tempStored`/`tempStoreFailed` counters in `BatchSummary`. The extracted-body writer lands with the future fetch→extract→store wiring (the Python extraction worker stays DB-less by design).
- Scheduled cleanup: SQL function `run_retention_cleanup()` deletes only `expires_at <= now()` (NULL never matches, so exemptions are safe by construction) and returns `{deleted, remaining, exempt, ran_at}`; `scripts/retention-cleanup.mjs` (`npm run retention:cleanup`) invokes it over PostgREST daily-cadence (plan §50 `maintenance.yml` "temporary text cleanup") and exits non-zero with an honest message when unconfigured/unreachable/erroring — a scheduler must see failure, not silent storage growth. Queue-row staleness is §50's "stale queue cleanup", not this phase's.
- Gate (`tests/retention.test.ts`): seeded fully-populated story + temp rows in all four states → cleanup deletes exactly the expired two, all nine permanent tables snapshot-equal byte-for-byte, archive window/member reports/entities/classification and the Phase 34 `search_story_ids` RPC still answer, repeats idempotent, exemptions persist, forbidden states rejected. Unit: `crawler/retention/temp-store.test.ts` (7), `tests/retention-cleanup-script.test.ts` (4 — exact RPC shape against a mock PostgREST + failure exits), `crawler/fetch/fetch.test.ts` (raw-HTML ingress, successes only).

## Automation (§§45–51 implemented)

- Plan §45 (no monolithic workflow): six workflow files in `.github/workflows/` — `ci.yml` plus one per pipeline stage (`discover`, `process`, `health`, `maintenance`, `train`). Every workflow carries `concurrency` (cancel-in-progress) and `timeout-minutes`; nothing deploys (no deploy job exists, so failed checks can never ship anything).
- Plan §46 (`ci.yml`): the single CI workflow now names every required check explicitly — lint, typecheck, TypeScript tests (which apply all migrations via PGlite), build, full Python tests, plus a dedicated **regression step** (`pytest tests/test_golden.py evaluation -q`: golden pins + frozen evaluation) and a dedicated **schema-validation step** (migrations exist + `db-foundation` + `source-registry` suites re-apply them).
- Plan §47 (`discover.yml`, every 30 min + dispatch): guards the discovery contract offline — channel parsers, checkpoint cursors, URL normalisation, idempotent enqueue SQL, registry sync. Never fetches full articles (or any live URL).
- Plan §48 (`process.yml`, dispatch-only with a `batch-size` input — the plan sets no cadence): the bounded offline process gate — pure-unit fetch/queue suites only; network/Chromium integration batches stay in CI's full suite so every run stays bounded and fast, and the durable queue (not the workflow) owns what survives an incomplete run.
- Plan §49 (`health.yml`, every 6 h + dispatch): metric computation, assessment order, and drift gates over PGlite — no live backend touched.
- Plan §50 (`maintenance.yml`, daily + dispatch): the retention contract (PGlite gate + script contract) unconditionally, plus the one executable duty — **temporary text cleanup** via `npm run retention:cleanup`, secret-guarded (runs with Supabase secrets, otherwise an honest skip: nothing deleted, nothing faked). Stale queue cleanup, metrics aggregation, recounts, and housekeeping need the production pipeline wiring and are not simulated.
- Plan §51 (`train.yml`, weekly Monday + dispatch — created now that statistical ML exists): candidate-model suites, hybrid gate, golden pins, and frozen evaluation (`pytest intelligence/models evaluation tests/test_golden.py -q`, 29 passed). Writes no `report.json`, appends no ledger — promotion stays a human-reviewed repo change, so a challenger can never ship itself from a schedule.
- Honesty rule for all five stage workflows: with no database and no secrets in this environment, they verify contracts offline and say so in their header comments; the only live call anywhere is the secret-guarded retention step. No workflow invents runners, parses live endpoints, or writes to a backend it cannot reach.
- Gate (`tests/workflows.test.ts`, 7): exactly the plan's six files exist; `ci.yml` names the §46 checklist; each stage declares its plan trigger (discover `*/30`, health `*/6`, maintenance daily, train weekly Monday, process dispatch-only); every file has concurrency + timeouts; every `npx vitest run` / `pytest` target is asserted to exist on disk; the process gate is asserted free of network/Chromium batches; the live maintenance step is asserted secret-guarded.

## Public semantics

- Default feed: Curated. Secondary: All Bihar News (includes routine crime/accidents/sports/entertainment excluded from Curated).
- Stories are the core public unit; articles preserve provenance.
- Never republish full copyrighted bodies publicly; use headline/metadata/link + structured facts.
