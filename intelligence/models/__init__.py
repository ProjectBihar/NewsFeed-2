"""Statistical learning (Phase 25). Cheap, CPU, measured - never prestige."""

from .features import build_vectorizer
from .retrain import dataset_version, run_retraining, should_retrain
from .train import refit, train_and_evaluate, write_report

__version__ = "0.1.0"

__all__ = [
    "build_vectorizer",
    "dataset_version",
    "refit",
    "run_retraining",
    "should_retrain",
    "train_and_evaluate",
    "write_report",
]
