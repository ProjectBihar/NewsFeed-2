# ProjectBihar Newsfeed V2

Bihar news-intelligence system. Rebuilt from scratch; V1 remains the
production/visual reference.

Full context: `PROJECTBIHAR_NEWSFEED_V2_MASTER_PLAN (1).md`.
Subsystem rules: `docs/ARCHITECTURE.md`.
Progress: `docs/IMPLEMENTATION_STATUS.md`.

## Phase 1 — shell

```bash
npm install
npm run lint
npm test
npm run build
pytest
```

Copy `.env.example` to `.env.local` and fill Supabase values when
Phase 2 begins. The dev shell builds and runs without credentials
(Supabase client returns `null` when unconfigured).

## Structure

```text
src/app/          Next.js public site (placeholder homepage)
src/lib/          Supabase scaffolding
crawler/          Phase 4+ (discovery/fetch — not started)
intelligence/     Phase 8+ (language/relevance/classify — not started)
extraction/       Phase 7 (Trafilatura worker stub)
data/             Phase 9 (Bihar knowledge base — not started)
tests/            fixtures / regression / golden (Phase 23+)
supabase/         migrations (Phase 2)
.github/workflows CI (lint + typecheck + tests + build + pytest)
```
