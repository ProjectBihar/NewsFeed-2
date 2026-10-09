# ProjectBihar Newsfeed V2

Bihar news intelligence: discover publisher URLs, extract and classify reports,
remove technical duplicates, group independent coverage into stories, and serve
public metadata with an authenticated admin observatory.

The public Next.js app lives in `src/`. Acquisition lives in `crawler/`, Python
extraction in `extraction/`, semantic rules in `intelligence/`, and the executable
orchestration in `pipeline/`. PostgreSQL stores the durable queue, public
metadata, audit records, and separately protected temporary article text.

Read [operations and deployment](docs/OPERATIONS.md) for the existing Supabase
project, Vercel setup, migrations, secrets, bounded pipeline commands, and launch
checks. [Architecture](docs/ARCHITECTURE.md) defines subsystem boundaries;
[implementation status](docs/IMPLEMENTATION_STATUS.md) records verified progress
and remaining production work. The master plan remains the product source of truth.

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

Copy `.env.example` to `.env.local` for website development. Pipeline commands
read process environment and need `DATABASE_URL`; automated live stages remain
disabled until `PIPELINE_ENABLED=true` is explicitly configured in GitHub.
