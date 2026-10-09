# Deployment and live pipeline

Repository: https://github.com/ProjectBihar/NewsFeed-2
Existing Supabase project: `zhaxcgvzdkhigtshcubj`.
Public API URL: `https://zhaxcgvzdkhigtshcubj.supabase.co`.

Use Vercel's Next.js preset for the website. Run acquisition and Python
processing on GitHub Actions; the website does not execute crawlers or spawn
Python. The existing Supabase project was initialized on 2026-10-09; see
`docs/SUPABASE_PREFLIGHT.md` for the applied migrations and live checks.
Website deployment remains pending.

## Local verification

Use Node 20 or newer and Python 3.12. From the repository root:

```sh
npm ci
python -m pip install -r extraction/requirements.txt -r intelligence/requirements.txt
npm run lint
npm run typecheck
npm run pipeline:build
npm test -- --maxWorkers=2
python -m pytest
npm run build
```

The pipeline tests use embedded PostgreSQL and a local HTTP news publisher;
they need Python dependencies installed before `npm test`. Chromium is needed
for the existing browser acquisition tests: `npx playwright install chromium`.
On Windows, if pytest cannot write its default temporary directory, set `TEMP`
and `TMP` to the repository's ignored `.test-tmp` directory.

## Apply schema safely

First inspect the existing project's schema and migration history. Back up
the database before applying reviewed migrations. An existing V1 database is
not automatically compatible with this V2 schema. Never replay the foundation
or source seed into a populated project without checking its history.

For a V2 database already at `20261001000001_phase35_retention`, apply these
three new migrations in order:

1. `supabase/migrations/20261009000001_access_boundaries.sql`
2. `supabase/migrations/20261009000002_processing_queue.sql`
3. `supabase/migrations/20261009000003_atomic_admin.sql`

For a genuinely empty V2 database, all migration files apply in filename order.
Each new migration is transactional; a failing statement rolls back that file.
Use the project's normal migration tooling or reviewed SQL in Supabase's SQL
editor. Applying only the access migration makes old anon-based admin writes
fail; deploy the service-only admin client with the remaining migrations.

Public roles can read eligible metadata, active sources, visible memberships,
and linked entity names. Queue rows, temporary bodies, health diagnostics,
classifier results and corrections remain private. Retention and admin RPCs
are service-only. Verify these boundaries with the anon key after migration.

## Website environment

Import `ProjectBihar/NewsFeed-2` into Vercel, using the repository root and the
Next.js framework preset (`npm run build`). Configure environment values in
Vercel's project settings before building:

| Variable                        | Purpose                                                          |
| ------------------------------- | ---------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Existing project's public API URL                                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing publishable or legacy anon reader key, protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server-only admin client                                         |
| `ADMIN_USERNAME`                | Admin Basic Auth username                                        |
| `ADMIN_PASSWORD_SHA256`         | 64-character hex password hash                                   |

Generate the hash with `npm run admin:hash` using the script's documented
password input. Store secrets in provider settings, never Git or chat.
Do not add `DATABASE_URL` to the public website. For local development, copy
`.env.example` to the ignored `.env.local` and configure the same values.

Use a separate staging database for writable previews. A preview connected to
the existing production project can change its data through admin actions.
Vercel's environment setup is documented at
https://vercel.com/docs/environment-variables/managing-environment-variables.

## Pipeline environment and commands

Add `DATABASE_URL` as a GitHub Actions repository secret, using the PostgreSQL
connection from Supabase's Connect dialog. Preserve the connection's TLS
settings; do not disable certificate verification. Prefer a direct connection
or session pooler supporting PostgreSQL transactions. Add public API URL and
`SUPABASE_SERVICE_ROLE_KEY` secrets for the retention job.

The runner reads process environment. It does not automatically load
`.env.local`. After exporting `DATABASE_URL` securely, build and run:

```sh
npm run pipeline:build
npm run pipeline:discover -- 5
npm run pipeline:process -- 10
npm run pipeline:health -- 200
```

Discovery enforces 1–200 sources and the existing 250 URLs per source cap;
queue insertion and checkpoint advancement commit together. Processing accepts
1–500 queue rows, resumes already fetched HTML first, and claims remaining
acquisition capacity. HTTP workers skip browser-flagged and inactive sources.
For operator-flagged browser sources, install Chromium and run
`npm run pipeline:browser -- 10`; blocked HTTP sources never automatically
escalate to a browser.

Processing claims expire after 15 minutes. Semantic failures retry with
exponential delay and stop after five attempts. Missing or expired HTML goes
back to acquisition. An ingest transaction serializes assignment and commits
article metadata, entity links, classifications, both membership representations,
story statistics and queue completion together. Exact duplicates search all
history; semantic comparisons use a seven-day window and reject candidate sets
larger than 2,000 rather than silently making incomplete decisions. This bound
needs indexed narrowing before high-volume operation.

Raw HTML and bodies stay in `temp_documents` under its fixed ten-day window;
reprocessing does not renew retention. Published descriptions are limited to
500 characters. Numeric entity IDs map back to stable knowledge identifiers
through aliases; same-name geography facets share the schema's canonical entity.
Manual corrections update real links and preserve their original classifier
version. Manual titles survive later ingestion.

## Enable and observe

Keep the GitHub repository variable `PIPELINE_ENABLED` unset until migrations,
credentials and a bounded manual run are verified. Set it to `true` to enable
live stages: discovery every 30 minutes, processing up to 50 rows twice an hour
at minutes 7 and 37, health every six hours, and daily temporary text cleanup.
Manual processing can override the batch size. Monitor queue growth and run
duration during the first day before increasing throughput. Jobs do not apply
schema automatically. PostgreSQL jobs download the official Supabase CA and
load it with `NODE_EXTRA_CA_CERTS`; the repository connection secret uses
`sslmode=verify-full` without a workstation-specific `sslrootcert` path.

Check `crawl_runs`, queue `processing_diagnostics`, and `source_health` in the
admin observatory. Health counts successful downloads after semantic completion
and separates extraction failure from irrelevance. Volume and parser drift
alerts are persisted with their evidence. Exceptions produce a nonzero process
exit code so Actions reports failure.

Before launch, verify real publishers from the execution host, public homepage,
story/district/source pages, archive and search against real data; verify admin
authentication and each correction/move/merge/split operation in staging.
Confirm no temporary body is exposed to the anon client, inspect mobile layout,
and observe queue progress and cleanup over at least one full day.

Disable `PIPELINE_ENABLED` to stop new scheduled writes during an incident.
Keep successful migration history and restore a backup if a schema rollback is
required; do not casually disable RLS. Revert website code only to a version
compatible with the service-only permissions. Durable queue and temporary
storage allow interrupted batches to resume.
