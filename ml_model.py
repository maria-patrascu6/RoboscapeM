
import csv
import os
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestClassifier

DATA_DIR = Path(
    os.environ.get(
        "ROBOSCAPE_DATA_DIR",
        str(Path(__file__).resolve().parent / "data")
    )
)
CSV_PATH = DATA_DIR / "game_sessions.csv"

MIN_REAL_SAMPLES = 12

_MODEL = None
_MODEL_MTIME = None
_MODEL_SAMPLES = 0
_MODEL_NOTE = "Se folosește regula inițială până există suficiente date."


def _features_from_row(row):
    try:
        return [
            float(row.get("last_stage", 1) or 1),
            float(row.get("stages_completed", 0) or 0),
            float(row.get("mistakes", 0) or 0),
            float(row.get("hints", 0) or 0),
            float(row.get("duration_seconds", 0) or 0),
            float(row.get("final_difficulty", 2) or 2),
        ]
    except (TypeError, ValueError):
        return None


def _load_and_train():
    global _MODEL, _MODEL_MTIME, _MODEL_SAMPLES, _MODEL_NOTE

    try:
        mtime = CSV_PATH.stat().st_mtime if CSV_PATH.exists() else None
    except OSError:
        mtime = None

    if mtime == _MODEL_MTIME:
        return

    _MODEL_MTIME = mtime
    _MODEL = None
    features_list = []
    labels = []

    if CSV_PATH.exists():
        try:
            with CSV_PATH.open("r", newline="", encoding="utf-8") as file:
                for row in csv.DictReader(file):
                    features = _features_from_row(row)
                    status = (
                        row.get("final_status") or ""
                    ).strip().lower()

                    if features is None:
                        continue

                    if status not in {
                        "completed", "restarted", "abandoned"
                    }:
                        continue

                    features_list.append(features)
                    labels.append(1 if status == "completed" else 0)

        except (OSError, csv.Error):
            pass

    _MODEL_SAMPLES = len(labels)

    if len(labels) >= MIN_REAL_SAMPLES and len(set(labels)) == 2:
        model = RandomForestClassifier(
            n_estimators=120,
            max_depth=5,
            min_samples_leaf=2,
            class_weight="balanced",
            random_state=42,
        )

        model.fit(
            np.asarray(features_list, dtype=float),
            np.asarray(labels, dtype=int),
        )

        _MODEL = model
        _MODEL_NOTE = f"Model antrenat cu {len(labels)} sesiuni reale."
    else:
        _MODEL_NOTE = (
            f"Date reale: {len(labels)} sesiuni. Sunt necesare "
            f"minimum {MIN_REAL_SAMPLES} sesiuni și ambele rezultate: "
            "misiuni finalizate și misiuni nefinalizate."
        )


def predict_difficulty(
    mistakes,
    hints,
    successes,
    stage=1,
    elapsed_seconds=0,
    current_difficulty=2,
):
    """1 = ușor, 2 = mediu, 3 = dificil."""
    _load_and_train()

    features = np.asarray([[
        max(1, min(int(stage), 7)),
        max(0, min(int(successes), 6)),
        max(0, min(int(mistakes), 100)),
        max(0, min(int(hints), 50)),
        max(0, min(int(elapsed_seconds), 7200)),
        max(1, min(int(current_difficulty), 3)),
    ]], dtype=float)

    if _MODEL is not None:
        probabilities = _MODEL.predict_proba(features)[0]
        classes = list(_MODEL.classes_)
        probability = float(probabilities[classes.index(1)])

        if probability >= 0.70:
            return 3
        if probability <= 0.40:
            return 1
        return 2

    pressure = (
        int(mistakes)
        + int(hints)
        + max(0, int(stage) - int(successes) - 1)
    )

    if pressure >= 5:
        return 1

    if pressure <= 1 and int(successes) >= 2:
        return 3

    return 2


def model_status():
    _load_and_train()

    return {
        "trained_on_real_data": _MODEL is not None,
        "samples": _MODEL_SAMPLES,
        "minimum_samples": MIN_REAL_SAMPLES,
        "message": _MODEL_NOTE,
    }
