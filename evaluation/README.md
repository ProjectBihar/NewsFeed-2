# Evaluation corpus

Permanent benchmark (Phase 23). ~320 labelled units across 10 component
sets — development-sized, honest about it: every metric below carries
its sample size. Grows toward 1000+ by reviewed additions.

## Run

```bash
python evaluation/run.py     # regenerates evaluation/report.json
pytest evaluation/           # reproducibility + thresholds + coverage gate
```

`run.py` imports the same modules production uses; `report.json` is the
committed output (metrics, sample sizes, thresholds, overall pass).
The gate fails on any drift: same corpus in, same report out.

## Current report (2026-09-29)

| Metric                       | Value         | n         |
| ---------------------------- | ------------- | --------- |
| relevance precision / recall | 1.000 / 1.000 | 60        |
| curated precision / recall   | 1.000 / 1.000 | 31        |
| article-type macro-F1        | 1.000         | 31        |
| category macro-F1            | 1.000         | 39        |
| event accuracy / macro-F1    | 1.000 / 1.000 | 31        |
| cluster precision / recall   | 1.000 / 1.000 | 210 pairs |
| extraction success rate      | 1.000         | 30        |
| language accuracy            | 0.975         | 40        |
| exact-dedup accuracy         | 1.000         | 14 pairs  |
| near-dup accuracy            | 1.000         | 13 pairs  |
| xlingual accuracy            | 1.000         | 10 pairs  |

## Growing the corpus

1. Add reviewed items to the owning component fixture (keep labels tight).
2. Run `python evaluation/run.py`, inspect metric deltas in the diff.
3. Commit fixture + regenerated `report.json` together — never one without the other.
4. Corrections from Phase 22 admin reviews are the primary future source (Phase 27 trains on them).
