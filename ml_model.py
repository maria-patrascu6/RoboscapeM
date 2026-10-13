
import csv
import os
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestClassifier

DATA_DIR = Path(
    os.environ.get("ROBOSCAPE_DATA_DIR", "/tmp/roboscape_data")
)
CSV_PATH = DATA_DIR / "game_sessions.csv"

MODEL = None
MODEL_MTIME = None
SAMPLE_COUNT = 0
MODEL_MESSAGE = "Modelul folosește momentan regula inițială."


def train_if_needed():
    global MODEL, MODEL_MTIME, SAMPLE_COUNT, MODEL_MESSAGE

    try:
        mtime = CSV_PATH.stat().st_mtime if CSV_PATH.exists() else None
    except OSError:
        mtime = None

    if mtime == MODEL_MTIME:
        return

    MODEL_MTIME = mtime
    MODEL = None
    X = []
    y = []

    if CSV_PATH.exists():
        try:
            with CSV_PATH.open("r", newline="", encoding="utf-8-sig") as f:
                for row in csv.DictReader(f):
                    try:
                        features = [
                            float(row.get("last_stage") or 1),
                            float(row.get("stages_completed") or 0),
                            float(row.get("mistakes") or 0),
                            float(row.get("hints") or 0),
                            float(row.get("duration_seconds") or 0),
                            float(row.get("final_difficulty") or 2),
                        ]
                    except (ValueError, TypeError):
                        continue

                    status = (row.get("final_status") or "").strip()

                    if status not in ("completed", "restarted"):
                        continue

                    X.append(features)
                    y.append(1 if status == "completed" else 0)

        except (OSError, csv.Error):
            pass

    SAMPLE_COUNT = len(y)

    if len(y) >= 12 and len(set(y)) == 2:
        MODEL = RandomForestClassifier(
            n_estimators=100,
            max_depth=5,
            min_samples_leaf=2,
            class_weight="balanced",
            random_state=42,
        )
        MODEL.fit(np.asarray(X), np.asarray(y))
        MODEL_MESSAGE = f"Model antrenat pe {len(y)} sesiuni."
    else:
        MODEL_MESSAGE = (
            f"Există {len(y)} sesiuni utilizabile. "
            "Sunt necesare cel puțin 12 sesiuni și ambele tipuri de rezultat."
        )


def predict_difficulty(
    mistakes,
    hints,
    successes,
    stage=1,
    elapsed_seconds=0,
    current_difficulty=2,
):
    train_if_needed()

    features = [[
        max(1, min(int(stage), 6)),
        max(0, int(successes)),
        max(0, int(mistakes)),
        max(0, int(hints)),
        max(0, int(elapsed_seconds)),
        max(1, min(int(current_difficulty), 3)),
    ]]

    if MODEL is not None:
        probabilities = MODEL.predict_proba(features)[0]
        classes = list(MODEL.classes_)
        probability = float(probabilities[classes.index(1)])

        if probability >= 0.70:
            return 3
        if probability <= 0.40:
            return 1
        return 2

    pressure = int(mistakes) + int(hints)

    if pressure >= 5:
        return 1

    if pressure <= 1 and int(successes) >= 2:
        return 3

    return 2


def model_status():
    train_if_needed()

    return {
        "trained_on_real_data": MODEL is not None,
        "samples": SAMPLE_COUNT,
        "message": MODEL_MESSAGE,
    }
