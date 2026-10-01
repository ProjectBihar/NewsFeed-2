# Supabase / Database

Phase 2 owns the shape. Phase 3+ owns rows.

## Apply migrations to a fresh database

```bash
# Every file in lexicographic order:
psql "$DATABASE_URL" -f supabase/migrations/20260928000001_phase2_foundation.sql
```

No dashboard-only schema changes. Any shape change is a new
versioned file, never an edit to an applied migration.

## Validate without a server

```bash
npm test -- tests/db-foundation.test.ts
```

The test boots embedded PGlite (real Postgres semantics, dev-only),
applies all migrations, then checks tables, keys, indexes, and an
end-to-end insert flow.
