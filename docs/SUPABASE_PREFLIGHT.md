# Supabase preflight — 2026-10-09

Project `PBNewsFeed-V2` (`zhaxcgvzdkhigtshcubj`) was inspected through the
user's signed-in Supabase dashboard. A read-only catalog query returned:

```json
{ "public_tables": [], "migration_history": null }
```

The project has no public application tables and no
`supabase_migrations.schema_migrations` table. It needs the full V2 migration
sequence, not just the three incremental migrations prepared on October 9.
No migrations, key rotations, password changes, or public grants were applied
during this inspection.

The existing publishable reader key and legacy service-role key were saved
to the Git-ignored `.env.local`; their values are not recorded here. The
service-role API request succeeded. The application SDK accepted the existing
publishable reader key and returned `PGRST205` for the missing `public.stories`
table, consistent with the catalog result.

The Connect dialog's Session pooler URI was placed in `DATABASE_URL` with its
`[YOUR-PASSWORD]` placeholder still present. The existing database password
cannot be retrieved from that dialog. The user must replace the placeholder
locally, percent-encoding reserved characters. This configuration is not ready
for PostgreSQL connections until that step is complete.

## Initialization completed

The user supplied the database password locally. The connection string was
repaired and its password URL-encoded without recording credentials here.
TLS verification succeeded using the CA certificate linked by the project's
Database Settings page. Local `DATABASE_URL` uses `sslmode=verify-full` and
`sslrootcert` pointing to the ignored local certificate file; deployment runners
must download that official certificate and use their own certificate path.

A second PostgreSQL preflight confirmed zero public tables. All ten migrations
were applied in filename order in one transaction, with their original SQL
recorded in `supabase_migrations.schema_migrations`. The result contains 14
sources and 23 endpoints. The pre-existing public function catalog was saved
locally before initialization.

Live SDK checks confirmed public source/story reads, denial of public queue and
temporary-document reads (`42501`), and successful service-role queue reads.
A bounded discovery run attempted three sources, succeeded on all three, and
inserted 641 URLs with no reported endpoint errors. Scheduled crawling remains
disabled and website deployment remains pending.

The first processing run downloaded and extracted all ten selected URLs with
zero reported errors. All ten were rejected by the relevance/publication
filters, so this batch created no public stories. Queue states afterward were
631 discovered and 10 rejected. This validates the live path and filtering;
it does not yet validate a relevant article's public story rendering.

## Live launch validation — 2026-10-10

A second batch selected ten already-discovered Bihar URLs. All ten downloaded,
extracted, passed relevance filtering and created stories with no processing
errors. Built public homepage, story, district, source, archive and Hindi search
routes returned HTTP 200 against this data. Built admin pages returned HTTP 200
with temporary local test credentials; unauthenticated admin returned HTTP 401.
Production admin credentials were preserved.

Live service-role rename, article/entity correction, move, split and merge
operations were verified inside one transaction and rolled back afterward.
GitHub Actions database/service secrets and Vercel production website environment
values were saved with user approval, without recording their values here.
