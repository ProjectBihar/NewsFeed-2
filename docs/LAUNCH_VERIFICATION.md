# V2 launch verification — 2026-10-10

Website: https://projectbihar-newsfeed-v2.vercel.app
Repository: https://github.com/ProjectBihar/NewsFeed-2
Supabase project: `zhaxcgvzdkhigtshcubj`

## Release and access

[Release PR #1](https://github.com/ProjectBihar/NewsFeed-2/pull/1) merged as
`a8b4673da7bcb852ea591bae0a74cc8c5775516c` after all required checks passed.
[CI evidence](https://github.com/ProjectBihar/NewsFeed-2/actions/runs/37979971507)
includes 262 JavaScript tests, Python tests, frozen/golden regressions, schema
tests, lint, typecheck and production build. Actions uses Node 24, Python 3.12,
installed Chromium and verified Supabase TLS. Python and native-library notices
are separated from the worker's JSON response.

[Production deployment](https://vercel.com/project-bihar/projectbihar-newsfeed-v2/oo1pKGNxey9HKexPFfXwW5trQvR6)
is Ready and tracks `main`. Approved website credentials are production-only;
GitHub pipeline secrets are stored separately. No credential values are in Git.

All ten migrations were applied atomically to the previously empty application
schema, with migration history recorded. The registry has 14 sources and 23
endpoints. Public metadata reads succeed, public queue/temp-document reads are
denied, and service-role reads succeed.

## Live checks

- A ten-article Bihar batch downloaded, extracted, classified and published ten
  stories without errors. Eight publishers passed discovery from the local host.
- Public homepage, story, district, source, archive and Hindi search pages returned
  HTTP 200 against live data. Seven initial stories appeared in Curated mode;
  all ten appeared in All Bihar News. Mobile rendered ten cards without overflow.
- Unauthenticated hosted admin returned HTTP 401. Built authenticated admin
  routes passed using temporary local-only test credentials. Existing production
  admin credentials were preserved.
- Live service-role rename, correction/entity edits, move, split and merge passed
  in a transaction that was rolled back afterward.
- Eight hosted client JavaScript assets contained neither the service-role key nor
  the admin password hash.
- [Hosted processing](https://github.com/ProjectBihar/NewsFeed-2/actions/runs/37980686228)
  downloaded and extracted ten further articles with no errors. All ten were
  filtered out; they created no public stories.
- [Hosted health](https://github.com/ProjectBihar/NewsFeed-2/actions/runs/37980692003)
  and [maintenance](https://github.com/ProjectBihar/NewsFeed-2/actions/runs/37980696339)
  passed. The initial cleanup had no expired documents to remove.
- [Initial hosted discovery](https://github.com/ProjectBihar/NewsFeed-2/actions/runs/37980681469)
  reached 11 of 12 active publishers and inserted 1,506 URLs. The two Indian
  Express endpoints returned HTTP 403 from that host. Their polling was paused,
  preserving existing articles and checkpoints. Source health records the block.
  The remaining eleven publishers continue; health polling excludes sources whose
  discovery endpoints are all paused, preserving their operator diagnosis.
- [Discovery retry](https://github.com/ProjectBihar/NewsFeed-2/actions/runs/37981767776)
  passed for all eleven remaining publishers, inserted 141 URLs and reported zero
  errors. The post-merge main CI also passed.

Endpoint failures now appear individually in discovery reports. A regression
test verifies HTTP 403 reporting without advancing a successful cursor or hiding
the failed run. Re-enable Indian Express endpoints only after verifying publisher
access from the execution host; no browser/CAPTCHA escalation was attempted.

## Observation still in progress

The user-requested cadence update on 10 October 2026 configures discovery every
45 minutes and processing up to 50 rows every 45 minutes, with processing slots
seven minutes after discovery. `PIPELINE_ENABLED=true` enables those live
stages, health every six hours and daily retention. Batches are
bounded and interrupted work remains in the durable queue.

The user approved hourly read-only follow-up checks for 24 hours, from
**10 October 2026 at 01:00 IST to 11 October 2026 at 01:00 IST**. The automation
`newsfeed-v2-first-day-monitoring` is active and reports meaningful failures,
required user actions or completion. It cannot modify code, data or deployments.

A full day has not yet been verified. Queue throughput, source freshness,
classification quality, scheduled cleanup and continuous availability still
need that observation. Candidate sets above 2,000 fail safely and require indexed
narrowing before high-volume operation.
