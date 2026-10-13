
import csv
import os
from pathlib import Path

DATA_DIR = Path(os.environ.get("ROBOSCAPE_DATA_DIR", "/tmp/roboscape_data"))
CSV_PATH = DATA_DIR / "game_sessions.csv"

DIFFICULTIES = {"easy", "normal", "hard"}


def fallback_difficulty(mistakes, hints, successes, current_difficulty):
    difficulty_order = ["easy", "normal", "hard"]

    if mistakes >= 5 or hints >= 4:
        return "easy"

    if successes >= 3 and mistakes <= 1 and hints <= 1:
        if current_difficulty == "easy":
            return "normal"
        if current_difficulty == "normal":
            return "hard"

    return current_difficulty if current_difficulty in DIFFICULTIES else "normal"


def predict_difficulty(
    mistakes,
    hints,
    successes,
    stage,
    elapsed_seconds,
    current_difficulty="normal",
):
    fallback = fallback_difficulty(
        mistakes, hints, successes, current_difficulty
    )

    try:
        from sklearn.tree import DecisionTreeClassifier

        if not CSV_PATH.exists():
            return fallback

        rows = []

        with CSV_PATH.open("r", newline="", encoding="utf-8-sig") as file:
            for row in csv.DictReader(file):
                label = row.get("final_difficulty", "")

                if label not in DIFFICULTIES:
                    continue

                try:
                    rows.append((
                        [
                            int(row.get("mistakes") or 0),
                            int(row.get("hints") or 0),
                            int(row.get("stages_completed") or 0),
                            int(row.get("last_stage") or 1),
                            int(row.get("duration_seconds") or 0),
                        ],
                        label,
                    ))
                except ValueError:
                    continue

        if len(rows) < 12 or len({label for _, label in rows}) < 2:
            return fallback

        X = [features for features, _ in rows]
        y = [label for _, label in rows]

        model = DecisionTreeClassifier(
            max_depth=3,
            min_samples_leaf=2,
            random_state=42,
        )
        model.fit(X, y)

        features = [[
            int(mistakes),
            int(hints),
            int(successes),
            int(stage),
            int(elapsed_seconds),
        ]]

        prediction = model.predict(features)[0]

        if prediction in DIFFICULTIES:
            return prediction

    except (ImportError, ValueError, OSError):
        pass

    return fallback


def model_status():
    try:
        if not CSV_PATH.exists():
            return {
                "message": "Modelul adaptiv este pregătit. Nu există încă date istorice."
            }

        with CSV_PATH.open("r", newline="", encoding="utf-8-sig") as file:
            rows = list(csv.DictReader(file))

        if len(rows) < 12:
            return {
                "message": (
                    f"Modelul adaptiv este activ. "
                    f"Există {len(rows)} sesiuni; sunt necesare mai multe "
                    f"date pentru antrenarea arborelui de decizie."
                )
            }

        return {
            "message": (
                f"Au fost înregistrate {len(rows)} sesiuni. "
                "Modelul poate folosi istoricul pentru a adapta dificultatea."
            )
        }

    except OSError:
        return {"message": "Modelul adaptiv folosește momentan regulile de rezervă."}
