
import csv
import os
from pathlib import Path

from sklearn.tree import DecisionTreeClassifier


DATA_DIR = Path(
    os.environ.get("ROBOSCAPE_DATA_DIR", "/tmp/roboscape_data")
)
CSV_PATH = DATA_DIR / "game_sessions.csv"

FEATURES = [
    "mistakes",
    "hints",
    "stages_completed",
    "duration_seconds",
    "last_stage",
]

_model = None
_model_signature = None


def read_training_data():
    if not CSV_PATH.exists():
        return [], []

    X = []
    y = []

    try:
        with CSV_PATH.open(
            "r", newline="", encoding="utf-8-sig"
        ) as file:
            reader = csv.DictReader(file)

            for row in reader:
                try:
                    label = row.get("final_difficulty", "").strip()

                    if label not in ("easy", "normal", "hard"):
                        continue

                    features = [
                        float(row.get("mistakes") or 0),
                        float(row.get("hints") or 0),
                        float(row.get("stages_completed") or 0),
                        float(row.get("duration_seconds") or 0),
                        float(row.get("last_stage") or 1),
                    ]

                    X.append(features)
                    y.append(label)

                except (ValueError, TypeError):
                    continue

    except (OSError, csv.Error):
        return [], []

    return X, y


def train_model():
    global _model, _model_signature

    X, y = read_training_data()

    if len(X) < 12 or len(set(y)) < 2:
        _model = None
        _model_signature = None
        return False

    try:
        model = DecisionTreeClassifier(
            max_depth=4,
            min_samples_leaf=2,
            random_state=42,
        )
        model.fit(X, y)

        _model = model
        _model_signature = len(X)

        return True

    except Exception:
        _model = None
        _model_signature = None
        return False


def predict_difficulty(
    mistakes,
    hints,
    successes,
    stage=1,
    elapsed_seconds=0,
    current_difficulty="normal",
):
    global _model, _model_signature

    X, y = read_training_data()

    if len(X) >= 12 and len(set(y)) >= 2:
        if _model is None or _model_signature != len(X):
            train_model()

    if _model is not None:
        try:
            features = [[
                float(mistakes),
                float(hints),
                float(successes),
                float(elapsed_seconds),
                float(stage),
            ]]

            prediction = _model.predict(features)[0]

            if prediction in ("easy", "normal", "hard"):
                return prediction

        except Exception:
            pass

    # Regulă de rezervă: funcționează și fără date de antrenare.
    pressure = int(mistakes) + int(hints)

    if pressure >= 5:
        return "easy"

    if pressure <= 1 and int(stage) >= 4:
        return "hard"

    if current_difficulty in ("easy", "normal", "hard"):
        return current_difficulty

    return "normal"


def model_status():
    X, y = read_training_data()

    if len(X) >= 12 and len(set(y)) >= 2:
        if _model is None or _model_signature != len(X):
            train_model()

    if _model is not None:
        return {
            "trained": True,
            "message": (
                "Model ML antrenat pe "
                + str(len(X))
                + " sesiuni înregistrate."
            ),
        }

    return {
        "trained": False,
        "message": (
            "Mod adaptiv activ. Pentru antrenarea modelului ML "
            "sunt necesare cel puțin 12 sesiuni valide și "
            "minimum două niveluri de dificultate în date."
        ),
    }
