"""Phase 23 completion gate: metrics reproduce from the committed benchmark."""

import json
from pathlib import Path

ROOT = Path(__file__).parent
REQUIRED_COVERAGE = [
    "english", "hindi", "bihar", "non-bihar", "development", "crime",
    "politics", "governance", "sports", "entertainment",
    "all-eight-categories", "district-ambiguity", "cross-language",
]


def test_report_reproduces_from_corpus():
    import run as evaluation_run

    committed = json.loads((ROOT / "report.json").read_text(encoding="utf-8"))
    fresh_metrics = evaluation_run.evaluate()
    assert set(fresh_metrics) == set(committed["metrics"]), "metric set drifted"
    for name, metric in committed["metrics"].items():
        assert fresh_metrics[name]["value"] == metric["value"], f"{name} not reproducible"
        assert fresh_metrics[name]["n"] == metric["n"], f"{name} sample size drifted"


def test_thresholds_hold_on_committed_report():
    committed = json.loads((ROOT / "report.json").read_text(encoding="utf-8"))
    failing = [name for name, check in committed["thresholds"].items() if not check["pass"]]
    assert committed["overall_pass"] and not failing, f"thresholds failing: {failing}"


def test_corpus_covers_required_dimensions():
    corpus = json.loads((ROOT / "corpus.json").read_text(encoding="utf-8"))
    assert corpus["version"] >= 1
    assert len(corpus["components"]) >= 10, "benchmark needs all component sets"
    covered = {tag for component in corpus["components"] for tag in component["coverage"]}
    missing = [tag for tag in REQUIRED_COVERAGE if tag not in covered]
    assert not missing, f"coverage gaps: {missing}"
