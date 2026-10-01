# Statistical models

Cheap CPU candidates (Phase 25), measured — never prestige. Logistic
regression and linear SVC on TF-IDF word (1,2) + character (3,5)
n-grams. Character n-grams carry the bilingual load.

## Reproduce

```bash
pip install -r intelligence/requirements.txt
python -c "import sys; sys.path.insert(0, 'intelligence'); from models.train import write_report; write_report()"
pytest intelligence/models -q
```

## Retrain (Phase 27)

```bash
python -c "import sys, json; sys.path.insert(0, 'intelligence'); from models.retrain import run_retraining; print(json.dumps(run_retraining(), indent=2))"
```

Triggers: weekly or 100 reviewed corrections (append `force=True` to
override). A cycle trains all candidates, compares the best challenger
against the pinned production winner on the frozen corpus, and promotes
only on explicit improvement (≥ +0.01) with no class regressions and a
passing hybrid gate. Every cycle records model version, training date,
dataset version, metrics, and the decision in `ledger.json`.

## Measured (2026-09-29, frozen corpora)

| Task             | n   | Protocol          | Winner              | CV macro-F1 | Fit   |
| ---------------- | --- | ----------------- | ------------------- | ----------- | ----- |
| relevance        | 60  | stratified 5-fold | logistic-regression | 0.832       | 1.000 |
| article_type     | 31  | leave-one-out     | linear-svc-balanced | 0.227       | 1.000 |
| primary_category | 37  | leave-one-out     | linear-svc-balanced | 0.224       | 1.000 |

Reading: fit 1.0 everywhere means the models can represent the tasks
and only data is missing. LOO on singletons is pessimistic by
construction — a held-out singleton can never be recalled. The
deterministic rules stay production; Phase 27 retraining compares
challengers against them on every triggered cycle (none has earned
promotion yet). Floors in `test_models.py` are regression tripwires,
not claims.

Committed: `report.json` (versions, data, metrics, predictions,
retrain provenance) and `ledger.json` (per-cycle promotion record).
Candidates refit deterministically on demand (`models.train.refit`).
