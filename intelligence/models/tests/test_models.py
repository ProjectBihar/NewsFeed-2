"""Phase 25 completion gate: candidates measured on the frozen corpora.

Floors are regression tripwires set below measured values — not quality
claims. The corpora are tiny; LOO macro-F1 on singletons is pessimistic
by construction (a held-out singleton can never be recalled).
"""

from models.train import refit, train_and_evaluate

TASKS = ("relevance", "article_type", "primary_category")

FLOORS = {
    "relevance": 0.75,
    "article_type": 0.15,
    "primary_category": 0.15,
}


def test_candidate_metrics_meet_floors():
    report = train_and_evaluate()
    assert set(report) == set(TASKS)
    for task, model in report.items():
        winner = model["results"][model["winner"]]
        assert winner["mean"] >= FLOORS[task], f"{task}: {winner['mean']}"
        assert winner["fit"] >= 0.9, f"{task}: cannot represent the task"


def test_training_is_deterministic():
    from models.train import relevance_data

    texts, _ = relevance_data()
    first = refit("relevance").predict(texts[:8])
    second = refit("relevance").predict(texts[:8])
    assert list(first) == list(second)


def test_refit_predicts_training_labels():
    from models.train import relevance_data

    texts, labels = relevance_data()
    estimator = refit("relevance")
    preds = estimator.predict(texts[:4])
    assert list(preds) == labels[:4]
