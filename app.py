
import csv
import os
import random
import time

from flask import Flask, jsonify, render_template, request, session

from ml_model import difficulty_model, difficulty_name

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "roboscape-local-key")

DATA_FILE = "results.csv"

STAGES = [
    "Labirintul",
    "Memoria bombei",
    "Cablurile",
    "Grila de securitate",
    "Puzzle logic",
    "Circuitul electric"
]

# Fiecare jucător primește propria stare de joc.
# Pentru un prototip local este suficientă sesiunea Flask.
def initial_state(name):
    return {
        "name": name,
        "stage": 0,
        "status": "playing",
        "difficulty": 1,
        "mistakes": 0,
        "started_at": time.time(),
        "stage_started_at": time.time(),
        "total_time": 0,
        "stage_results": [],
        "challenge": make_challenge(0, 1)
    }


def make_challenge(stage, difficulty):
    if stage == 0:
        size = 5 if difficulty == 0 else 7 if difficulty == 1 else 9
        return {
            "type": "maze",
            "size": size,
            "description": "Ajută robotul să ajungă la ieșire."
        }

    if stage == 1:
        shapes = ["▲", "●", "■", "◆", "★", "⬟"]
        random.shuffle(shapes)
        return {
            "type": "memory",
            "shapes": shapes,
            "description": "Memorează cele 6 simboluri, apoi introdu-le în ordine."
        }

    if stage == 2:
        wires = ["roșu", "albastru", "verde", "galben"]
        shuffled = wires[:]
        random.shuffle(shuffled)
        return {
            "type": "wires",
            "wires": shuffled,
            "targets": wires,
            "description": "Trage fiecare cablu la poziția cu aceeași culoare."
        }

    if stage == 3:
        size = 3 if difficulty == 0 else 4 if difficulty == 1 else 5
        numbers = list(range(1, size * size + 1))
        random.shuffle(numbers)
        return {
            "type": "grid",
            "size": size,
            "numbers": numbers,
            "description": "Selectează numerele în ordine crescătoare."
        }

    if stage == 4:
        a = random.randint(2, 8)
        b = random.randint(2, 8)
        return {
            "type": "logic",
            "question": f"Cât face {a} × {b} + {a}?",
            "answer": a * b + a,
            "description": "Rezolvă puzzle-ul logic."
        }

    return {
        "type": "circuit",
        "sequence": [1, 2, 3, 4],
        "description": "Activează componentele în ordinea corectă."
    }


def public_state():
    state = session.get("game")
    if not state:
        return {"status": "not_started"}

    challenge = dict(state["challenge"])

    # Nu trimitem soluția puzzle-ului logic către browser.
    challenge.pop("answer", None)

    return {
        "name": state["name"],
        "stage": state["stage"],
        "stage_number": state["stage"] + 1,
        "stage_name": STAGES[state["stage"]]
            if state["stage"] < len(STAGES) else "Finalizat",
        "status": state["status"],
        "difficulty": state["difficulty"],
        "difficulty_name": difficulty_name(state["difficulty"]),
        "mistakes": state["mistakes"],
        "challenge": challenge,
        "stages_total": len(STAGES),
        "stage_results": state["stage_results"]
    }


def save_result(state):
    exists = os.path.exists(DATA_FILE)

    with open(DATA_FILE, "a", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)

        if not exists:
            writer.writerow([
                "name", "stages_completed", "time_seconds", "mistakes"
            ])

        writer.writerow([
            state["name"],
            len(state["stage_results"]),
            round(state["total_time"], 2),
            state["mistakes"]
        ])


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/ml-status")
def ml_status():
    return jsonify({
        "model_trained": difficulty_model.trained,
        "training_examples": len(difficulty_model.X)
    })


@app.route("/start", methods=["POST"])
def start():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()[:30]

    if not name:
        return jsonify({"error": "Introdu un nume înainte să începi."}), 400

    session["game"] = initial_state(name)
    session.modified = True

    return jsonify(public_state())


@app.route("/state")
def state():
    return jsonify(public_state())


@app.route("/action", methods=["POST"])
def action():
    state = session.get("game")

    if not state:
        return jsonify({"error": "Pornește mai întâi jocul."}), 400

    if state["status"] != "playing":
        return jsonify({"error": "Jocul s-a încheiat."}), 400

    data = request.get_json(silent=True) or {}
    action_type = data.get("type")
    answer = data.get("answer")

    stage = state["stage"]
    challenge = state["challenge"]
    success = False

    if action_type == "solve":
        if stage == 0:
            success = answer == "exit"

        elif stage == 1:
            success = answer == challenge["shapes"]

        elif stage == 2:
            success = answer == challenge["targets"]

        elif stage == 3:
            numbers = challenge["numbers"]
            success = answer == sorted(numbers)

        elif stage == 4:
            success = str(answer).strip() == str(challenge["answer"])

        elif stage == 5:
            success = answer == challenge["sequence"]

    if not success:
        state["mistakes"] += 1
        session["game"] = state
        session.modified = True
        return jsonify({
            "correct": False,
            "message": "Nu este corect. Încearcă din nou.",
            "state": public_state()
        })

    elapsed = time.time() - state["stage_started_at"]

    difficulty_model.add_result(
        elapsed,
        state["mistakes"],
        True
    )

    state["stage_results"].append({
        "stage": stage + 1,
        "time": round(elapsed, 2),
        "mistakes": state["mistakes"]
    })

    state["stage"] += 1

    if state["stage"] >= len(STAGES):
        state["status"] = "completed"
        state["total_time"] = time.time() - state["started_at"]
        save_result(state)
    else:
        state["difficulty"] = difficulty_model.predict(
            elapsed,
            state["mistakes"]
        )
        state["stage_started_at"] = time.time()
        state["challenge"] = make_challenge(
            state["stage"],
            state["difficulty"]
        )

    session["game"] = state
    session.modified = True

    return jsonify({
        "correct": True,
        "message": "Bravo! Ai trecut etapa.",
        "state": public_state()
    })


@app.route("/leaderboard")
def leaderboard():
    results = []

    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, newline="", encoding="utf-8") as file:
            for row in csv.DictReader(file):
                results.append(row)

    results.sort(
        key=lambda row: (
            -int(row["stages_completed"]),
            float(row["time_seconds"])
        )
    )

    return jsonify(results[:10])


if __name__ == "__main__":
    app.run(debug=True)
