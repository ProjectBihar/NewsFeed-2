# ProjectBihar Newsfeed V2 — Master Build Plan

## 1. Purpose

ProjectBihar Newsfeed V2 will be rebuilt from scratch in a new repository while preserving the visual character of the existing ProjectBihar Newsfeed.

The current repository must remain available as the working V1 reference. V2 must not inherit V1's crawler architecture, obsolete modules, authentication flow, personal sentiment system, or tightly coupled classification logic.

The central objective is to build an open, continuously updated Bihar news-intelligence system that can:

1. discover newly published material across Bihar-relevant sources;
2. retrieve articles reliably;
3. extract clean article metadata and text;
4. determine whether Bihar is substantively central to the article;
5. identify article type, topic, event type, geography, and entities;
6. deduplicate repeated content;
7. cluster separate reports about the same real-world development;
8. preserve provenance and source relationships;
9. expose a clean public feed with no reader authentication;
10. provide a separate protected administrative observatory;
11. operate without recurring paid APIs or hosted LLMs;
12. improve through measured human corrections and regression testing.

The system must remain fully functional even if no LLM is available.

---

# 2. Non-Negotiable Principles

## 2.1 Zero Recurring Intelligence Cost

The architecture must not require:

- OpenAI API
- Anthropic API
- Gemini API
- Groq API
- commercial search APIs
- paid scraping proxies
- paid vector databases
- hosted Redis
- paid queue infrastructure
- local LLM infrastructure
- any other paid model or inference dependency

Optional future integrations may be added only if they do not become required for core operation.

---

## 2.2 Public Access

The reader-facing website must be open to everyone.

Remove from the public experience:

- sign-in
- sign-out
- session checks
- authentication redirects
- reader accounts
- user avatars
- personal sentiment profiles
- personal recommendation systems

The public homepage must load immediately without authentication.

Administration must remain protected separately.

---

## 2.3 Preserve the Existing Visual Identity

V2 is a new information system, not a visual redesign.

The existing V1 interface should be used as the visual reference for:

- typography
- spacing
- card proportions
- category pills
- responsive layout
- light mode
- dark mode
- restrained visual hierarchy
- general visual polish
- density
- interaction feel

The principle is:

> New engine, familiar interface.

The frontend may evolve where the new story-based architecture requires it, but it should remain recognisably descended from the current ProjectBihar Newsfeed.

---

## 2.4 Separation of Responsibilities

Each subsystem must have one clear responsibility.

Discovery discovers URLs.

Acquisition downloads resources.

Extraction turns pages into structured article records.

Bihar relevance determines whether Bihar is substantively central.

Classification determines article type, topic, and event type.

Deduplication removes duplicate publications.

Story clustering groups distinct reports about the same real-world event.

Presentation renders the public interface.

No subsystem should silently absorb another subsystem's responsibility.

---

## 2.5 Explainable Decisions

Every major classification must preserve the evidence that produced it.

For example:

```json
{
  "bihar_relevance_score": 0.91,
  "evidence": ["PATNA dateline", "BIADA entity", "Bihta location", "Bihar government reference"]
}
```

Do not store only a final Boolean when meaningful evidence can be preserved cheaply.

---

## 2.6 Events, Not URLs, Are the Core Public Unit

An article is something a publisher published.

A story is the real-world development described by one or more articles.

V2 must treat these as separate entities.

Example:

```text
STORY
Bihar Cabinet approves Patna Metro expansion

ARTICLES
- The Hindu
- Indian Express
- Dainik Jagran
- Prabhat Khabar
- Dainik Bhaskar
```

The public feed should primarily display stories, not a repetitive sequence of near-identical article cards.

---

# 3. Repository Strategy

Create a new repository.

Recommended name:

```text
ProjectBihar/projectbihar-newsfeed-v2
```

Do not develop V2 inside the existing V1 repository.

The V1 repository remains:

- production reference;
- visual reference;
- source of existing Bihar entity knowledge;
- source of working source URLs;
- source of useful regression examples.

Do not migrate obsolete architecture merely because it exists.

---

# 4. Recommended Technology Stack

| Layer                     | Technology                         |
| ------------------------- | ---------------------------------- |
| Public web application    | Next.js                            |
| UI                        | React + TypeScript                 |
| Styling                   | Current ProjectBihar visual system |
| Database                  | Supabase/PostgreSQL                |
| Crawler orchestration     | TypeScript + Crawlee               |
| HTTP crawling             | Crawlee HTTP/Cheerio crawler       |
| Browser fallback          | Playwright through Crawlee         |
| Article extraction        | Python + Trafilatura               |
| Extraction fallback       | Mozilla Readability                |
| Text/statistical analysis | Python                             |
| Statistical ML            | scikit-learn                       |
| Near-duplicate detection  | MinHash and/or SimHash             |
| Scheduling                | GitHub Actions                     |
| Hosting                   | Vercel                             |
| TypeScript tests          | Vitest or equivalent               |
| Python tests              | Pytest                             |
| Paid APIs                 | None                               |
| LLM requirement           | None                               |

---

# 5. Repository Structure

Use a single repository.

Recommended structure:

```text
projectbihar-newsfeed-v2/

├── src/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── styles/
│
├── crawler/
│   ├── discovery/
│   ├── fetch/
│   ├── adapters/
│   ├── queues/
│   ├── normalisation/
│   └── health/
│
├── intelligence/
│   ├── geo/
│   ├── entities/
│   ├── classification/
│   ├── dedup/
│   ├── clustering/
│   └── scoring/
│
├── extraction/
│   ├── trafilatura_worker/
│   └── tests/
│
├── data/
│   ├── geography/
│   ├── institutions/
│   ├── infrastructure/
│   ├── aliases/
│   └── sources/
│
├── tests/
│   ├── fixtures/
│   ├── regression/
│   └── golden/
│
├── supabase/
│   └── migrations/
│
├── scripts/
│
├── docs/
│
└── .github/
    └── workflows/
```

Do not create new top-level directories without a clear architectural need.

---

# 6. Target Architecture

```text
                     SOURCE REGISTRY
                           │
          ┌────────────────┼────────────────┐
          │                │                │
         RSS           SITEMAPS        HTML SECTIONS
          │                │                │
          └────────────────┼────────────────┘
                           │
                     DISCOVERY QUEUE
                           │
                     URL NORMALISER
                           │
                     REQUEST QUEUE
                           │
              ┌────────────┴─────────────┐
              │                          │
        FAST HTTP CRAWLER           BROWSER FALLBACK
              │                          │
              └────────────┬─────────────┘
                           │
                  ARTICLE EXTRACTION
                           │
                    DATA VALIDATION
                           │
                   LANGUAGE DETECTION
                           │
                  BIHAR RELEVANCE
                           │
                    ENTITY RESOLUTION
                           │
                    ARTICLE TYPE
                           │
                TOPIC + EVENT CLASSIFIER
                           │
                    EXACT DEDUP
                           │
                   NEAR-DUPLICATION
                           │
                    STORY CLUSTERING
                           │
                      DATABASE
                           │
               ┌───────────┴───────────┐
               │                       │
          PUBLIC WEBSITE          ADMIN OBSERVATORY
```

---

# 7. Agent Operating Protocol

Every coding agent must receive the full plan for context, but it must be authorised to implement only one phase at a time.

Every implementation prompt should contain language equivalent to:

```text
You are implementing Phase X only.

Read the repository sufficiently to understand the interfaces relevant to Phase X.

Do not implement later phases.

Do not refactor unrelated working code.

Before changing anything, run the existing relevant test suite.

After implementation, run all relevant tests and inspect the actual outputs.

If an existing architectural contract conflicts with your implementation,
adapt your work to the contract rather than rewriting unrelated systems.

Update docs/IMPLEMENTATION_STATUS.md before finishing.

Stop after Phase X is complete.
```

Agents must never be given an instruction such as:

```text
Build the whole V2 system.
```

---

# 8. Required Architecture Documents

Create and maintain:

```text
docs/ARCHITECTURE.md
docs/IMPLEMENTATION_STATUS.md
```

## ARCHITECTURE.md

Must describe:

- subsystem ownership;
- inputs;
- outputs;
- interfaces;
- prohibited responsibilities;
- dependency rules;
- database contracts;
- pipeline order.

Example:

```text
Discovery may identify URLs.
Discovery may not classify content.

Extraction may parse article content.
Extraction may not decide Bihar relevance.

Classification may categorise an article.
Classification may not fetch websites.
```

## IMPLEMENTATION_STATUS.md

Each phase completion must record:

```text
Phase completed
Files changed
Interfaces introduced
Tests added
Tests passed
Known limitations
Required next-phase prerequisites
```

---

# 9. Phase 0 — Freeze V1

## Objective

Preserve the existing production system before V2 work begins.

## Tasks

Create a final production tag:

```text
v1-production-final
```

Document:

- current source list;
- current categories;
- existing Bihar entity dictionaries;
- existing database schema;
- environment variables;
- current production behaviour;
- current visual components;
- existing regression examples.

## Preserve from V1

Migrate later where useful:

- Bihar geographical knowledge;
- Bihar institutional names;
- Hindi aliases;
- useful source URLs;
- category vocabulary;
- valuable regression examples;
- current UI visual language;
- dark mode;
- responsive card system;
- category tabs;
- useful typography and spacing.

## Do Not Migrate

Do not copy as active V2 architecture:

- old scraper loops;
- duplicate source registries;
- obsolete classifier modules;
- obsolete database wrapper code;
- public authentication;
- user sentiment profiles;
- user ratings;
- public blocked phrases;
- abandoned Cloudflare Worker code.

## Completion Gate

V1 remains deployable and unchanged.

Stop.

---

# 10. Phase 1 — V2 Application Shell

## Objective

Create a clean, testable repository foundation.

## Build

- Next.js application;
- TypeScript configuration;
- Supabase client scaffolding;
- Python extraction directory;
- testing infrastructure;
- GitHub Actions CI;
- `.env.example`;
- initial documentation;
- formatting/linting configuration.

## Initial Homepage

Only:

```text
ProjectBihar Newsfeed V2
System under development.
```

Do not migrate the full V1 UI yet.

Do not create crawler logic.

Do not create classification logic.

## Required Tests

The following must pass:

```text
npm install
npm run lint
npm test
npm run build
pytest
```

## Completion Gate

The empty V2 architecture builds locally and in CI.

Stop.

---

# 11. Phase 2 — Database Foundation

## Objective

Create the canonical V2 data model before ingestion begins.

## Core Tables

### sources

```text
id
name
domain
language
scope
source_type
priority
active
created_at
updated_at
```

Recommended `source_type` values:

```text
news
official
research
institutional
```

### source_endpoints

```text
id
source_id
endpoint_type
url
active
priority
last_checked
last_seen_url
last_seen_published_at
last_success_at
created_at
updated_at
```

Recommended endpoint types:

```text
rss
atom
news_sitemap
sitemap
wordpress_api
section
```

### crawl_runs

```text
id
started_at
completed_at
status
sources_attempted
sources_succeeded
urls_discovered
urls_fetched
articles_extracted
articles_relevant
stories_created
errors
created_at
```

### crawl_queue

```text
id
url
canonical_url
source_id
discovered_at
discovery_method
priority
status
attempts
next_retry_at
last_attempt_at
last_error
created_at
updated_at
```

Suggested queue states:

```text
discovered
queued
fetching
fetched
extracted
rejected
retry
failed
blocked
complete
```

### articles

```text
id
source_id
url
canonical_url
headline
description
language
language_confidence
script_mix
published_at
first_seen_at
last_seen_at
content_hash
similarity_fingerprint
extraction_confidence
bihar_relevance_score
article_type
primary_category
event_type
district_id
story_id
curated
created_at
updated_at
```

### stories

```text
id
canonical_title
primary_category
event_type
district_id
first_seen_at
last_seen_at
article_count
source_count
status
created_at
updated_at
```

### story_articles

```text
story_id
article_id
cluster_score
created_at
```

### entities

```text
id
canonical_name
entity_type
district_id
latitude
longitude
parent_entity_id
valid_from
valid_to
created_at
updated_at
```

### entity_aliases

```text
id
entity_id
alias
language
alias_type
created_at
```

### article_entities

```text
article_id
entity_id
confidence
evidence
created_at
```

### source_health

```text
id
source_id
checked_at
fetch_success_rate
extraction_success_rate
articles_discovered
http_403_count
http_429_count
failure_count
health_state
diagnostics
```

### classification_results

```text
id
article_id
classifier_version
category
article_type
event_type
confidence
reason_codes
created_at
```

### admin_corrections

Store every correction rather than silently replacing history.

Suggested fields:

```text
id
article_id
story_id
field_name
old_value
new_value
reason
created_at
```

## Requirements

- all schema changes must be migrations;
- blank database setup must be reproducible;
- indexes must exist for common feed and archive queries;
- foreign keys must be explicit;
- migrations must be versioned;
- no manual dashboard-only schema changes.

## Completion Gate

A fresh Supabase/PostgreSQL database can be created entirely from migrations.

Stop.

---

# 12. Phase 3 — Source Registry

## Objective

Create one canonical source catalogue.

Do not crawl articles yet.

## Source Groups

Organise sources into:

```text
National English
National Hindi
Bihar English
Bihar Hindi
District/local
Business/economy
Environment
Education
Official Bihar
Institutional
```

## Source Record Requirements

Each source must specify:

```text
name
domain
language
scope
source_type
priority
active
```

Each discovery channel must exist in `source_endpoints`.

Example:

```text
Source: Dainik Bhaskar
Language: hi
Scope: Bihar
Priority: high

Endpoints:
- Bihar section
- news sitemap if available
- sitemap if useful
```

## Source Expansion Waves

### Wave A

Current V1 working sources.

### Wave B

15–25 major Bihar and national publications.

### Wave C

District/local media.

### Wave D

Specialist and official sources.

Do not add hundreds of sources at once.

Every source must pass health and extraction checks before production activation.

## Completion Gate

At least current V1 source coverage exists in the new structured registry.

Stop.

---

# 13. Phase 4 — Discovery Engine

## Objective

Discover new article URLs.

Do not fetch full article content.

Do not classify.

## Discovery Order

For each source:

```text
1. RSS
2. Atom
3. News sitemap
4. General sitemap
5. WordPress API
6. Configured section page
```

The same URL may be discovered through several mechanisms.

Deduplicate before queue insertion.

## Remove the Ten-Article Limitation

Do not use:

```text
slice(0, 10)
```

Use endpoint checkpoints.

Each endpoint stores:

```text
last_seen_url
last_seen_published_at
last_success_at
```

Process all genuinely new entries within a configurable safety limit.

Recommended initial safety limit:

```text
250 discovered URLs per source per run
```

If the source produces more than this, preserve the remainder for the next run rather than discarding it.

## URL Normalisation

Remove common tracking parameters where safe:

```text
utm_source
utm_medium
utm_campaign
utm_content
fbclid
gclid
```

Normalise cautiously:

- fragments;
- common AMP variants;
- mobile variants;
- trailing slash where safe;
- relative links;
- obvious duplicate URL forms.

Do not invent destructive transformations for unfamiliar publishers.

## Testing

Create URL fixtures covering:

- normal URLs;
- tracking URLs;
- relative URLs;
- AMP URLs;
- mobile URLs;
- duplicates;
- invalid URLs.

## Completion Gate

The engine can discover and enqueue URLs reliably without fetching article bodies.

Stop.

---

# 14. Phase 5 — HTTP Acquisition Engine

## Objective

Fetch queued URLs robustly.

Use Crawlee.

Do not classify.

## Output

Each fetch should record:

```text
HTTP status
final URL
content type
response time
fetch timestamp
HTML or structured response
```

## Initial Concurrency

Start conservatively:

```text
global concurrency: 10
per-domain concurrency: 2
```

Make these configurable.

## Retry Policy

### Timeout / HTTP 408

Retry with bounded backoff.

### HTTP 429

Respect backoff and retry later.

### HTTP 500–599

Retry later with a maximum retry count.

### HTTP 404 / 410

Mark permanent failure.

### HTTP 403

Record separately and use fallback policy only when configured.

### DNS/network errors

Retry later.

### Unsupported content type

Reject safely.

## Persistence

The queue must survive:

- process crash;
- GitHub Actions cancellation;
- timeout;
- partial completion.

## Completion Gate

Representative URLs can be fetched concurrently without losing queue state.

Stop.

---

# 15. Phase 6 — Browser Fallback

## Objective

Support websites that genuinely require JavaScript rendering.

Use Playwright through Crawlee.

Browser crawling is a fallback, not the default.

## Rules

Use browser mode only where:

```text
requires_browser = true
```

or where a source has been explicitly classified as requiring browser rendering after repeated HTTP failure.

Do not send every 403 or extraction failure through Chromium.

## Completion Gate

A defined set of JS-heavy sources can be acquired successfully while HTTP-friendly sources remain HTTP-only.

Stop.

---

# 16. Phase 7 — Article Extraction

## Objective

Convert acquired pages into structured article records.

## Input

```text
raw HTML
URL
source ID
known metadata
```

## Output

```text
title
description
body
author
publication date
canonical URL
structured metadata
extraction method
extraction confidence
```

## Extraction Cascade

```text
1. JSON-LD
2. OpenGraph
3. Trafilatura
4. Mozilla Readability
5. source-specific adapter
```

Do not rely on generic extraction of every `<p>` element.

## Extraction Confidence

Confidence should consider:

```text
headline found
publication date found
description found
body found
body length
paragraph structure
boilerplate ratio
metadata agreement
canonical URL
```

Suggested states:

```text
high
medium
low
failed
```

Low-confidence records should remain inspectable.

## Fixture Set

Build fixtures from at least 30 representative publishers.

For each fixture, define expected:

- headline presence;
- publication date;
- body presence;
- canonical URL if known.

## Completion Gate

Extraction regression tests pass across the fixture corpus.

Stop.

---

# 17. Phase 8 — Language Detection

## Objective

Determine article language without equating script with language.

Store:

```text
language
language_confidence
script_mix
```

Initial languages:

```text
en
hi
```

Architecture must permit future addition of:

```text
ur
mai
bho
mag
```

without changing the main articles schema.

## Example

An English article containing `पटना` should still be classifiable as English.

## Completion Gate

A manually labelled bilingual test set meets the agreed accuracy threshold.

Stop.

---

# 18. Phase 9 — Bihar Knowledge Base

## Objective

Convert the useful V1 geography/entity dictionary into structured data.

Do not keep one giant TypeScript constant file.

## Recommended Data Structure

```text
data/geography/
    districts.json
    subdivisions.json
    blocks.json
    towns.json
    rivers.json

data/institutions/
    universities.json
    hospitals.json
    departments.json
    agencies.json
    corporations.json

data/infrastructure/
    airports.json
    railway_stations.json
    highways.json
    industrial_areas.json
    major_projects.json
```

## Entity Record

```text
id
canonical_name
type
aliases
hindi_names
romanisations
district
parent_entity
latitude
longitude
valid_from
valid_to
```

Example aliases:

```text
PMCH
Patna Medical College
Patna Medical College and Hospital
पीएमसीएच
```

must resolve to one canonical entity.

## Completion Gate

Useful V1 Bihar entity knowledge is migrated into structured files and validated.

Stop.

---

# 19. Phase 10 — Bihar Relevance Engine

## Objective

Answer only:

> Is Bihar substantively central to this article?

Do not classify topic yet.

## Positive Evidence Families

### Direct Geography

```text
Bihar
districts
towns
blocks
datelines
```

### Institutional Evidence

```text
Bihar government
BIADA
BPSC
BSSC
BSEB
Bihar Police
Patna High Court
state universities
state agencies
```

### Infrastructure Evidence

```text
Patna Metro
Bihar industrial parks
state highways
specific airports
specific railway projects
```

### Administrative/Political Evidence

Bihar-specific offices and institutions.

## Negative Evidence

Include:

- another state's dateline;
- strong non-Bihar district dominance;
- national stories where Bihar appears only incidentally;
- ambiguous location names resolved to non-Bihar entities.

## Output

```json
{
  "pass": true,
  "score": 0.91,
  "confidence": "high",
  "evidence": [],
  "locations": [],
  "entities": []
}
```

Never return only a Boolean.

## Benchmark

Create a manually labelled Bihar/non-Bihar corpus.

Measure:

```text
precision
recall
false positives
false negatives
```

## Completion Gate

The Bihar relevance benchmark passes agreed thresholds and all known V1 false-positive regression cases.

Stop.

---

# 20. Phase 11 — Article-Type Classification

## Objective

Replace binary `noise` with two separate instruments: a descriptive
article-type taxonomy, and a significance hierarchy for curation.

The distinction must never be framed as “real news versus noise”, nor
as positive versus negative news. Curation filters for substantive
consequence for Bihar — not for positivity, negativity, politics,
crime, or development as such.

Preserve the separation between:

1. Bihar relevance: is Bihar substantively central to the article?
2. Article type: what kind of news is this?
3. Topic/event type: what is the article about and what happened?
4. Curation significance: how important is this for understanding
   changes in Bihar's institutions, economy, infrastructure, public
   services, environment, society, or governance?

Governing principle:

> Filter for consequence, not positivity.

Initial types:

```text
development
governance
politics
election_campaign
crime
accident
court
weather
environmental_event
sports
entertainment
opinion
analysis
official_release
roundup
advertorial
miscellaneous
```

## Curation Significance

Assign one significance tier. Tiers describe consequence, not sentiment:
a damning audit finding and an industrial approval can both be tier A/B.

```text
A — Core Development
Substantive economic, institutional, infrastructure, industrial,
agricultural, educational, healthcare, environmental, administrative,
legislative, public-finance, research, policy, project, investment,
employment, tender, approval, construction, completion, delay, audit,
or governance developments.

B — Public Significance
Events that may not be “development news” but carry major consequences
for Bihar: important court rulings, serious governance failures, major
disasters, infrastructure failures, large protests, major law-and-order
developments, institutional controversies, corruption/audit findings,
significant social conflict, etc.

C — Routine Bihar News
Ordinary local crime, accidents, routine political statements, minor
administrative events, everyday party activity, and similar material
that is genuinely Bihar-related but usually excluded from the default
curated feed.

D — Low-Value / Peripheral
Entertainment gossip, celebrity material, clickbait, generic
astrology/lifestyle material, repetitive round-ups, sports trivia
unless institutionally significant, and national stories in which
Bihar is merely incidental. Normally discarded or heavily
deprioritised; retained only where needed for crawler
diagnostics/evaluation.
```

The default Curated feed contains A plus selected B.

`All Bihar News` contains A + B + C, subject to ordinary quality and
Bihar-relevance checks.

D normally need not enter the permanent public news corpus.

Record the determination in the existing `curated` flag; preserve the
tier and its evidence in `classification_results.reason_codes`.

Do not determine significance from isolated keywords. Context,
entities, event type, scale, institutional consequence, and geographic
relevance determine the result.

## Mandatory Regression Examples

```text
"Bihar Police arrests murder accused"
→ crime
→ curated false
```

```text
"Bihar Police receives modernisation funding"
→ governance/development
→ curated true
```

```text
"Supreme Court judgment involving Bihar policy"
→ Bihar relevant
```

```text
"Supreme Court judgment with incidental Bihar mention"
→ Bihar relevance dependent on context, not keyword alone
```

```text
"Three arrested after robbery in Patna"
→ crime
→ C (routine)
→ curated false
```

```text
"Bihar approves ₹750 crore police modernisation programme"
→ governance/development
→ A
→ curated true
```

```text
"Minister attacks opponent at election rally"
→ politics/campaign
→ C (routine rhetoric)
→ curated false
```

```text
"Cabinet approves industrial policy"
→ governance/industry
→ A
→ curated true
```

```text
"Bridge collapses one year after construction"
→ infrastructure failure/accountability
→ B (A/B depending on consequences)
→ curated true
```

```text
"CAG finds major expenditure irregularities"
→ governance/audit/accountability
→ B
→ curated true
```

```text
"Major communal violence disrupts a district"
→ public significance / law-and-order / social conflict
→ B, curated true despite not being development news
```

```text
"Celebrity relationship controversy involving a Bihar-born actor"
→ D (peripheral)
→ curated false
```

## Completion Gate

Article-type regression corpus passes.

Stop.

---

# 21. Phase 12 — Topic Classification

## Objective

Assign substantive subject domains.

Keep the current public categories:

```text
Economy
Infrastructure
Industry
Agriculture
Education
Healthcare
Environment
Governance
```

Internally support:

```text
primary_category
secondary_topics[]
```

Example:

```text
Primary:
Infrastructure

Secondary:
Railways
Transport
Public Investment
```

Do not force every conceptual distinction into the eight top-level categories.

## Completion Gate

Category benchmark and regression tests pass.

Stop.

---

# 22. Phase 13 — Event-Type Classification

## Objective

Determine what happened.

Initial event vocabulary:

```text
announcement
proposal
approval
funding
tender
construction_started
construction_progress
completion
inauguration
delay
cancellation
report
audit
court_order
appointment
recruitment
policy_change
programme_launch
protest
election_campaign
accident
crime
```

Example:

```text
Headline:
Patna Metro expansion receives Cabinet approval

Primary category:
Infrastructure

Event:
Approval

Entity:
Patna Metro

Actor:
Bihar Cabinet

Location:
Patna
```

## Completion Gate

Event-type fixture set passes.

Stop.

---

# 23. Phase 14 — Exact Deduplication

## Objective

Remove technical duplicates before story clustering.

Deduplicate through:

```text
canonical URL
normalised URL
content hash
normalised headline hash
```

Technical duplicates include:

- tracking URL variants;
- AMP versions;
- mobile versions;
- identical syndicated bodies;
- repeated ingestion of the same page.

Do not confuse exact duplicates with separate publishers covering the same event.

## Completion Gate

Known duplicate fixtures collapse correctly.

Stop.

---

# 24. Phase 15 — Near-Duplicate Detection

## Objective

Identify highly similar articles that are not exact duplicates.

Use:

```text
MinHash
and/or
SimHash
```

Candidate comparisons must be bounded.

Use combinations of:

```text
recent publication window
location overlap
entity overlap
category compatibility
event-type compatibility
```

Do not compare every article against every article in history.

## Completion Gate

Near-duplicate benchmark passes without excessive false merges.

Stop.

---

# 25. Phase 16 — Story Clustering

## Objective

Group distinct articles reporting the same real-world development.

## Story Model

Example:

```text
STORY

Bihar Cabinet approves Patna Metro expansion

Articles:
- The Hindu
- Indian Express
- Jagran
- Prabhat Khabar
- Bhaskar
```

## Candidate Cluster Signals

Use:

```text
headline similarity
entity overlap
district overlap
event-type match
category match
number overlap
date overlap
publication-time distance
```

Initial conceptual weighting may begin around:

```text
entity overlap          30%
event match             20%
headline similarity     20%
location match          15%
category match          10%
temporal proximity       5%
```

These weights are provisional.

They must be tuned from evaluation rather than treated as permanent truth.

## Administrative Controls

Admin must later be able to:

```text
merge stories
split stories
move article between stories
```

## Completion Gate

A manually reviewed story-clustering benchmark passes.

Stop.

---

# 26. Phase 17 — Cross-Language Clustering

## Objective

Cluster Hindi and English reports of the same development.

Do not begin with multilingual embeddings.

First use:

```text
canonical entities
locations
numbers
dates
event type
category
transliterated proper nouns
```

Example:

```text
पटना मेट्रो
Patna Metro
```

must resolve to the same canonical entity.

Only if deterministic/entity-based clustering remains insufficient should a later V2.x version consider a small open multilingual embedding model.

Core operation must never depend on such a model.

## Completion Gate

A Hindi-English clustering fixture corpus passes.

Stop.

---

# 27. Phase 18 — Canonical Story Title

## Objective

Assign a readable title to each story without requiring an LLM.

Initially select the strongest source headline using deterministic quality rules.

Prefer headlines that:

```text
contain the main entity
contain the event
are not clickbait
are reasonably concise
have high metadata quality
are grammatically complete
```

Allow admin manual override.

## Completion Gate

Representative story clusters receive sensible canonical titles.

Stop.

---

# 28. Phase 19 — Source Health System

## Objective

Make source failure observable.

Each source should have one state:

```text
HEALTHY
DEGRADED
BROKEN
STALE
BLOCKED
```

## Track

```text
last successful crawl
HTTP failure rate
article discovery rate
extraction success rate
403 count
429 count
recent volume baseline
RSS freshness
```

## Example

```text
Dainik Bhaskar

last success:        14:31
discovered:          52
fetched:             49
extracted:           47
failures:             2

status:
HEALTHY
```

## Completion Gate

Source status changes correctly under simulated failure conditions.

Stop.

---

# 29. Phase 20 — Drift and Anomaly Detection

## Objective

Detect when a source probably changed or broke.

Examples:

Normal:

```text
40–80 links/day
```

Suddenly:

```text
0 links/day
```

Flag:

```text
DISCOVERY_VOLUME_ANOMALY
```

Extraction success:

```text
94% → 21%
```

Flag:

```text
PARSER_DRIFT_SUSPECTED
```

Use simple rolling statistics.

No ML is necessary initially.

## Completion Gate

Synthetic anomalies produce the expected health alerts.

Stop.

---

# 30. Phase 21 — Admin Observatory

## Objective

Create a protected internal system-health interface.

This is not the public website.

## Dashboard Example

```text
SYSTEM STATUS

Sources             78
Healthy             72
Degraded             4
Broken               2

Last crawl
Started           14:30
Completed         14:38

URLs discovered    834
Fetched            612
Extracted          589
Bihar relevant     231
Curated             84
Stories             51
```

## Admin Views

Include:

```text
sources
source health
crawl runs
failed URLs
retry queue
low-confidence extraction
low-confidence classification
story clusters
classification corrections
entity corrections
```

## Admin Security

Public site remains open.

`/admin` must remain protected.

Use the simplest secure mechanism compatible with the deployment environment.

Do not reintroduce reader accounts.

## Completion Gate

Admin can diagnose crawler health and inspect failures without reading raw GitHub Actions logs.

Stop.

---

# 31. Phase 22 — Admin Correction System

## Objective

Turn human corrections into durable labelled data.

Admin must be able to correct:

```text
Bihar relevance
district
article type
primary category
event type
entities
story assignment
canonical story title
```

Store:

```text
original prediction
corrected value
timestamp
classifier/rule version
optional reason
```

Do not silently overwrite history.

## Story Controls

Provide:

```text
merge stories
split story
move article
rename story
```

## Completion Gate

Corrections are persisted and auditable.

Stop.

---

# 32. Phase 23 — Evaluation Corpus

## Objective

Create a permanent benchmark.

Start with approximately:

```text
200–300 manually reviewed articles
```

Increase progressively towards:

```text
1,000+
```

The corpus must cover:

```text
English
Hindi
Bihar
non-Bihar
development
crime
politics
governance
sports
entertainment
all eight categories
significance tiers A/B/C/D
district ambiguity
cross-language story clusters
```

## Required Metrics

Track:

```text
Bihar relevance precision
Bihar relevance recall
curated precision
curated recall
significance-tier agreement (A/B/C/D)
article-type macro-F1
category macro-F1
event-type accuracy/F1
cluster precision
cluster recall
extraction success rate
```

Do not claim classifier quality without measured evidence.

## Completion Gate

Evaluation scripts can reproduce all reported metrics from the committed benchmark.

Stop.

---

# 33. Phase 24 — Golden Regression System

## Objective

Ensure each fixed bug becomes permanently testable.

Examples:

```text
tests/regression/police-modernisation.json
tests/regression/supreme-court-bihar-policy.json
tests/regression/patna-vs-other-patna-like-token.json
tests/regression/crime-vs-governance.json
tests/regression/bridge-collapse-accountability.json
tests/regression/cag-expenditure-irregularities.json
tests/regression/communal-violence-public-significance.json
tests/regression/celebrity-bihar-born-peripheral.json
tests/regression/rally-rhetoric-routine.json
```

A bug fix is incomplete until the failing example becomes a regression test.

## Completion Gate

All known historical failure cases are committed as permanent tests.

Stop.

---

# 34. Phase 25 — Statistical Classifier

## Objective

Add lightweight statistical learning only after the deterministic system and evaluation corpus exist.

Use inexpensive CPU models such as:

```text
TF-IDF word n-grams
character n-grams
logistic regression
LinearSVC
```

Potential models:

```text
Bihar relevance
article type
primary category
```

Character n-grams are especially useful for bilingual and spelling-variable material.

Do not introduce neural infrastructure merely for prestige.

## Completion Gate

Candidate model performance is measured against the frozen evaluation corpus.

Stop.

---

# 35. Phase 26 — Hybrid Decision Engine

## Objective

Combine:

```text
entity evidence
deterministic rules
statistical classifier
```

Example:

```text
Rule engine:
Governance 0.78

Statistical classifier:
Governance 0.84

Entity evidence:
Bihar Cabinet + Patna

Final:
Governance
confidence 0.87
```

When systems strongly disagree:

```text
confidence = low
```

Low-confidence cases may enter admin review.

## Completion Gate

Hybrid performance improves measured metrics without unacceptable regressions.

Stop.

---

# 36. Phase 27 — Candidate Model Retraining

## Objective

Create controlled self-improvement.

Trigger candidate training:

```text
weekly
```

or after:

```text
100 new reviewed corrections
```

Candidate model must not replace production automatically merely because it trained successfully.

Compare:

```text
production model
candidate model
```

using the frozen evaluation corpus.

Promote only if explicit metrics improve and important regressions do not appear.

Record:

```text
model version
training date
dataset version
metrics
promotion decision
```

## Completion Gate

Training and evaluation are reproducible.

Stop.

---

# 37. Phase 28 — Public UI Migration

## Objective

Bring the successful V1 visual system into V2 after the story/data architecture is stable.

## Preserve

```text
card feel
spacing
typography
dark mode
category pills
responsive behaviour
visual restraint
overall polish
```

Do not redesign merely for novelty.

## Remove

```text
login
logout
reader session checks
user avatar
sentiment buttons
personal recommendation prediction
public block-phrase controls
```

## Completion Gate

The public site visually resembles the existing ProjectBihar Newsfeed while operating on the V2 story architecture.

Stop.

---

# 38. Phase 29 — Homepage

## Objective

Make stories the primary public unit.

Recommended navigation:

```text
Latest
Topics
Districts
Sources
Archive
```

Recommended feed modes:

```text
Curated
All Bihar News
```

Default:

```text
Curated
```

## Story Card Example

```text
Infrastructure

Bihar Cabinet approves Patna Metro expansion

Patna · 42m

7 sources · EN + HI
```

Avoid needless synopsis text when it adds no information.

## Completion Gate

Homepage renders story clusters correctly across desktop and mobile.

Stop.

---

# 39. Phase 30 — Story Page

## Objective

Expose the structure behind a clustered development.

A story page should show:

```text
canonical headline
primary category
event type
district/location
first reported
latest update
source count
language coverage
```

## Reports Section

Example:

```text
The Hindu          10:14
Dainik Jagran      10:27
Indian Express     10:42
Prabhat Khabar     11:03
```

Each source links to the original publisher.

Do not republish full copyrighted articles.

## Entities Section

Example:

```text
Patna Metro
Bihar Cabinet
Urban Development Department
Patna
```

## Completion Gate

Story page correctly represents clustered reports and provenance.

Stop.

---

# 40. Phase 31 — District Pages

## Objective

Create district-level archives.

Routes:

```text
/district/patna
/district/gaya
/district/jamui
...
```

Eventually support all 38 districts.

Show:

```text
latest developments
recent stories
topic distribution
source coverage
```

Do not create empty decorative statistics.

## Completion Gate

District routing and filters work from real article/story geography.

Stop.

---

# 41. Phase 32 — Source Pages

## Objective

Create transparent source archives.

Example:

```text
/source/the-hindu
```

Public fields:

```text
source name
language
scope
source type
recent Bihar coverage
latest stories/articles
```

Do not expose internal crawler diagnostics publicly.

Those belong in admin.

## Completion Gate

Each active source has a stable public page.

Stop.

---

# 42. Phase 33 — Archive

## Objective

Replace V1's latest-200 limitation.

Use server-side pagination.

Support date-based archive queries.

Example:

```text
/archive?year=2026&month=09
```

Do not load the entire archive into the browser.

## Completion Gate

Large article/story counts remain performant.

Stop.

---

# 43. Phase 34 — Search

## Objective

Provide useful archive search without introducing Elasticsearch.

Use PostgreSQL search capabilities first.

Search over:

```text
story titles
article titles
entities
districts
categories
sources
```

Filters:

```text
date
district
category
article type
event type
source
language
```

## Completion Gate

Search works on representative archive-scale data.

Stop.

---

# 44. Phase 35 — Storage Retention

## Objective

Keep the system within free database/storage limits.

## Permanently Store

```text
URL
canonical URL
headline
publisher description
publication metadata
hashes/fingerprints
entities
locations
classification
story relationships
diagnostic scores
```

## Temporarily Store

```text
raw HTML
full extracted article body
```

Recommended initial retention:

```text
7–14 days
```

Longer only where needed for:

```text
regression fixtures
manual review
debugging
```

Add a scheduled cleanup process.

## Completion Gate

Retention works without removing metadata required by the archive.

Stop.

---

# 45. GitHub Actions Design

Do not create one monolithic workflow.

Recommended workflows:

```text
ci.yml
discover.yml
process.yml
health.yml
maintenance.yml
train.yml
```

---

# 46. ci.yml

Run on relevant pushes and pull requests.

Must include:

```text
lint
TypeScript tests
Python tests
database/schema validation
regression tests
build
```

No deployment if required checks fail.

---

# 47. discover.yml

Recommended initial cadence:

```text
every 30 minutes
```

Responsibilities:

```text
poll source endpoints
discover URLs
normalise URLs
enqueue new URLs
record discovery metrics
```

Do not fetch full articles.

---

# 48. process.yml

Responsibilities:

```text
read queue
fetch
extract
validate
detect language
run Bihar relevance
classify
deduplicate
cluster
persist
```

Execution must be bounded.

If the workflow ends before the queue is empty:

```text
remaining queue survives
```

---

# 49. health.yml

Recommended cadence:

```text
every 6 hours
```

Checks:

```text
source freshness
failure rates
volume anomalies
extraction degradation
feed staleness
blocked sources
```

---

# 50. maintenance.yml

Recommended cadence:

```text
daily
```

Responsibilities:

```text
temporary text cleanup
stale queue cleanup
metrics aggregation
story statistic recalculation
database housekeeping
```

---

# 51. train.yml

Create only after statistical ML is introduced.

Recommended cadence:

```text
weekly
```

Responsibilities:

```text
build candidate model
evaluate
store metrics
report comparison
```

Do not deploy a worse model automatically.

---

# 52. Source Health Data Model

Every active source should expose internal technical metrics such as:

```text
last successful crawl
last discovered article
articles discovered per day
fetch success rate
extraction success rate
403 rate
429 rate
timeout rate
average response time
recent baseline
health state
```

The system must distinguish:

```text
no news published
```

from:

```text
crawler failed
```

This distinction is fundamental.

---

# 53. Crawl Run Audit

Every crawl run must create a durable record.

Example:

```text
RUN #20260928-1430

Start             14:30
End               14:38

Sources             82
Succeeded           78
Degraded             3
Failed               1

URLs discovered   1242
Fetched             691
Relevant            323
Curated             104
Duplicates          188
Stories created      61
```

---

# 54. Public Feed Semantics

## Curated

Default feed.

Contains tier A (Core Development) plus selected tier B (Public
Significance): material with substantive consequences for
understanding Bihar's institutions, economy, infrastructure, public
services, environment, society, or governance — whether positive or
negative in tone.

## All Bihar News

Contains tiers A + B + C, subject to ordinary quality and
Bihar-relevance checks: everything curated, plus routine Bihar news
(ordinary crime, accidents, routine politics) omitted from the default
display.

Tier D (low-value/peripheral) normally need not enter the permanent
public corpus, except where needed for crawler diagnostics/evaluation.

Do not use `All News` to mean every non-Bihar URL discovered from national feeds.

Non-Bihar material should normally be rejected before permanent article storage, except minimal diagnostics where useful.

---

# 55. Story Prominence

Chronology should remain important, but story prominence may also use transparent signals such as:

```text
freshness
independent source count
source diversity
Bihar relevance
development relevance
geographic significance
extraction confidence
```

Do not use political or ideological weighting.

Do not present opaque importance scores to readers unless their meaning is clear.

---

# 56. Developing and Widely Reported Signals

Because V2 clusters stories, it may label objective coverage conditions.

Examples:

```text
Developing
Widely reported
```

Possible basis:

```text
rapidly increasing source count
multiple independent publishers
recent publication burst
```

Never equate:

```text
reported by many sources
```

with:

```text
confirmed true
```

The UI should say:

```text
Reported by 8 sources
```

not:

```text
Confirmed
```

unless a distinct verification process exists.

---

# 57. Government and Official Sources

Official material should have a separate source type.

Examples:

```text
Bihar departments
district administrations
Bihar government releases
BIADA
BPSC
BSEB
health department
road department
PIB when Bihar-relevant
```

Public UI should distinguish:

```text
News report
Official source
Analysis
```

Official material must not masquerade as independent journalism.

---

# 58. Provenance

Each article/story should preserve enough provenance to answer:

```text
where was this discovered?
what is the original URL?
what is the canonical URL?
when was it published?
when was it first seen?
what source published it?
what story cluster contains it?
what classifier/rule version processed it?
```

This makes the system auditable.

---

# 59. Open-Source Foundations

Use mature open-source components where they replace unnecessary custom infrastructure.

## Crawlee

Use for:

```text
request queues
concurrency
retry handling
HTTP crawling
browser fallback
request persistence
routing
```

Repository:

```text
https://github.com/apify/crawlee
```

## Trafilatura

Use for:

```text
main article extraction
metadata extraction
multilingual extraction
boilerplate removal
```

Repository:

```text
https://github.com/adbar/trafilatura
```

## Mozilla Readability

Use as an article-extraction fallback.

Repository:

```text
https://github.com/mozilla/readability
```

## Newspaper4k

May be used as an additional extraction/reference fallback where beneficial.

Repository:

```text
https://github.com/AndyTheFactory/newspaper4k
```

## datasketch

Use for:

```text
MinHash
LSH
approximate similarity
near-duplicate detection
```

Repository:

```text
https://github.com/ekzhu/datasketch
```

## Media Cloud

Use primarily as architectural inspiration for feed discovery and large-scale news ingestion patterns.

Relevant repositories:

```text
https://github.com/mediacloud/rss-fetcher
https://github.com/mediacloud/feed_seeker
```

## news-please

Use as architectural reference for news crawling and extraction patterns.

Repository:

```text
https://github.com/fhamborg/news-please
```

Do not copy an entire third-party application where a smaller component is sufficient.

---

# 60. Prohibited Premature Infrastructure

Do not introduce the following unless actual measured requirements later prove them necessary:

```text
Kubernetes
Kafka
RabbitMQ
Celery
Redis
Elasticsearch
GraphQL
microservices
Docker Swarm
vector database
hosted workflow orchestrator
```

At V2 scale these would increase operational burden without proportional value.

---

# 61. Dependency Rule

An agent may add a dependency only when:

```text
the standard library or existing dependency is inadequate
and
the package is actively maintained
and
the licence is compatible
and
the dependency removes substantial custom complexity
```

Avoid dependency accumulation.

---

# 62. No LLM Shortcuts

Agents must not solve difficult classification or summarisation tasks by introducing:

```text
OpenAI
Claude
Gemini
Groq
Ollama
local LLM requirement
```

The core system must work without them.

---

# 63. No Fabricated Accuracy

Never write claims such as:

```text
92% intelligent classifier
95% accurate
```

unless supported by a reproducible labelled benchmark.

Report:

```text
Precision
Recall
F1
Dataset size
Dataset version
Evaluation date
```

---

# 64. No Synthetic Summaries in V2.0

Do not build LLM-generated story summaries.

Use:

```text
canonical headline
publisher descriptions
lead paragraphs where legally/technically appropriate
structured facts
source counts
entity lists
event metadata
```

Template-generated factual interface text is acceptable.

Example:

```text
7 publications have reported this development since 10:14 IST.
```

---

# 65. Public Copyright Boundary

ProjectBihar should index and organise reporting.

It should not republish full copyrighted news articles.

Public story pages should display:

```text
headline
short publisher-provided metadata/description where appropriate
source
publication time
link to original
structured ProjectBihar metadata
```

Full extracted text should be used internally for processing and temporary debugging rather than public republication.

---

# 66. V2.0 Launch Boundary

V2.0 is launchable when all of the following exist and function reliably:

```text
public site with no reader login
current visual language preserved
structured source registry
RSS discovery
sitemap discovery
HTML-section discovery
persistent request queue
robust HTTP acquisition
browser fallback for selected sources
reliable article extraction
English/Hindi language detection
structured Bihar knowledge base
Bihar relevance engine
article-type classification
eight public categories
event-type classification
exact deduplication
near-duplicate detection
story clustering
cross-language clustering at usable quality
source-health monitoring
admin diagnostics
admin corrections
district metadata
archive
search
regression testing
```

---

# 67. Explicitly Not Required for V2.0

Do not delay launch for:

```text
neural embeddings
AI summaries
personal recommendations
mobile app
real-time WebSockets
social-network ingestion
hundreds of sources
complex recommendation systems
vector databases
```

These belong to later V2.x iterations if justified.

---

# 68. V2.1 Possibilities

After V2.0 stabilises, consider:

```text
more district/local media
official-document ingestion
entity pages
related stories
project timelines
coverage-gap detection
news maps
multilingual embedding-assisted clustering
historical story relationships
```

---

# 69. V2.2 Long-Term Direction

Once enough structured history exists, ProjectBihar Newsfeed should be able to reconstruct the evolution of long-running public projects and institutions.

Example:

```text
PATNA METRO

2025 proposal
2025 DPR
2026 Cabinet approval
2026 tender
2027 construction
...
```

The same architecture could support:

```text
industrial units
universities
roads
bridges
hospitals
dams
railway projects
policy programmes
```

At that point the platform becomes not merely a news aggregator, but a longitudinal record of Bihar's institutional and developmental change.

---

# 70. Phase Execution Order

Agents must proceed broadly in this order:

```text
Phase 0   Freeze V1
Phase 1   V2 shell
Phase 2   Database
Phase 3   Source registry
Phase 4   Discovery
Phase 5   HTTP acquisition
Phase 6   Browser fallback
Phase 7   Extraction
Phase 8   Language detection
Phase 9   Bihar knowledge base
Phase 10  Bihar relevance
Phase 11  Article type
Phase 12  Topic classification
Phase 13  Event type
Phase 14  Exact deduplication
Phase 15  Near-duplicate detection
Phase 16  Story clustering
Phase 17  Cross-language clustering
Phase 18  Story-title selection
Phase 19  Source health
Phase 20  Drift detection
Phase 21  Admin observatory
Phase 22  Admin corrections
Phase 23  Evaluation corpus
Phase 24  Golden regression system
Phase 25  Statistical classifier
Phase 26  Hybrid decision engine
Phase 27  Candidate retraining
Phase 28  Public UI migration
Phase 29  Homepage
Phase 30  Story page
Phase 31  District pages
Phase 32  Source pages
Phase 33  Archive
Phase 34  Search
Phase 35  Storage retention
```

Later phases may be reorganised only where a concrete implementation dependency requires it.

Do not collapse large groups of phases merely for convenience.

---

# 71. Core Rule for Every Agent

The full plan is context.

The assigned phase is the task.

When an agent receives this file, the execution prompt must explicitly identify one authorised phase.

Example:

```text
Read PROJECTBIHAR_NEWSFEED_V2_MASTER_PLAN.md carefully.

You are implementing Phase 4 — Discovery Engine only.

Treat every other phase as architectural context, not as work authorised in
this session.

Inspect the existing implementation and architecture contracts first.
Implement Phase 4 completely.
Add and run the required tests.
Do not implement extraction, classification, UI, or later-phase functionality.
Update docs/IMPLEMENTATION_STATUS.md.
Stop once Phase 4 satisfies its completion gate.
```

This rule is mandatory.

The objective is to let agents understand the final system without allowing them to rebuild unrelated subsystems simultaneously.

---

# 72. Definition of Success

ProjectBihar Newsfeed V2 succeeds when it becomes:

- substantially more complete than V1;
- significantly harder to break;
- transparent about failures;
- open to every reader;
- independent of paid AI services;
- capable of understanding Bihar through structured geography and institutions;
- able to distinguish routine crime, politics, governance, development, and other article types;
- able to recognise that several publications may describe one event;
- able to connect Hindi and English reporting;
- able to preserve a searchable historical record;
- measurable through proper evaluation rather than anecdotal confidence;
- visually continuous with the existing ProjectBihar Newsfeed;
- maintainable by successive coding agents without architectural drift;
- financially sustainable at zero recurring software-service cost for the intended scale.

The system should become more accurate through better data, correction, tests, and measured statistical learning rather than through ever-growing ad hoc keyword exceptions.
