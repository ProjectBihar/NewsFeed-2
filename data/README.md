# Bihar knowledge base

Structured geography/institution/infrastructure data for the Phase 10
relevance engine. No giant constant file: one topic per JSON file,
validated by `tests/test_knowledge_base.py`.

## Layout and coverage

| File                                   | Coverage         | Records                                                          |
| -------------------------------------- | ---------------- | ---------------------------------------------------------------- |
| `geography/districts.json`             | complete (38/38) | districts + division/HQ                                          |
| `geography/towns.json`                 | seed             | major towns, HQs, reported places                                |
| `geography/subdivisions.json`          | seed             | 38 Sadar + 4 reported non-Sadar (full 101 later)                 |
| `geography/rivers.json`                | seed             | Ganga + major tributaries                                        |
| `geography/places.json`                | seed             | heritage/wildlife places reported without a town name            |
| `geography/blocks.json`                | pending          | intentionally empty — needs official 534-block lists, no guesses |
| `institutions/universities.json`       | seed             | 20 universities/institutes                                       |
| `institutions/hospitals.json`          | seed             | 12 medical colleges/institutes                                   |
| `institutions/departments.json`        | seed             | 36 state departments                                             |
| `institutions/agencies.json`           | seed             | 12 regulatory/recruitment/development bodies                     |
| `institutions/corporations.json`       | seed             | 8 commercial PSUs (no overlap with agencies)                     |
| `infrastructure/airports.json`         | seed             | 5 operational/upcoming                                           |
| `infrastructure/railway_stations.json` | seed             | 22 major stations with codes                                     |
| `infrastructure/highways.json`         | seed             | trunk NHs + named corridors/bridges                              |
| `infrastructure/industrial_areas.json` | seed             | 10 principal areas                                               |
| `infrastructure/major_projects.json`   | seed             | 8 tracked projects (V2.2 direction)                              |

## Rules

- One canonical entity per real thing. Entries that would duplicate a
  canonical (e.g. a second "Bihta Airport") are removed, not merged.
- A surface form may be shared across facets of the SAME place only
  (town / subdivision / station / district / local river or road,
  e.g. "Gaya", "Kiul"); Phase 10 disambiguates those by context.
  Sharing across different places fails validation.
- Coordinates are HQ/approx at 2dp, or null. Null beats wrong.
- Hindi names are required for districts and towns; optional elsewhere.
- `valid_from`/`valid_to` are ISO dates or null; reserved for renames
  and reorganisations.
