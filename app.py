
import csv
import os
import time
import uuid
from pathlib import Path

from flask import Flask, jsonify, render_template, request, session, send_file

from main import new_game, public_state, handle_action
from ml_model import model_status

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "roboscape-development-key")

DATA_DIR = Path(os.environ.get("ROBOSCAPE_DATA_DIR", "/tmp/roboscape_data"))
CSV_PATH = DATA_DIR / "game_sessions.csv"

FIELDS = [
    "session_id",
    "player_name",
    "started_at",
    "ended_at",
    "duration_seconds",
    "final_status",
    "last_stage",
    "stages_completed",
    "mistakes",
    "hints",
    "final_difficulty",
]


def ensure_csv():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if not CSV_PATH.exists() or CSV_PATH.stat().st_size == 0:
        with CSV_PATH.open("w", newline="", encoding="utf-8-sig") as file:
            writer = csv.DictWriter(file, fieldnames=FIELDS)
            writer.writeheader()
        return

    with CSV_PATH.open("r", newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        old_fields = reader.fieldnames or []
        rows = list(reader)

    if old_fields != FIELDS:
        with CSV_PATH.open("w", newline="", encoding="utf-8-sig") as file:
            writer = csv.DictWriter(file, fieldnames=FIELDS)
            writer.writeheader()

            for row in rows:
                writer.writerow({
                    field: row.get(field, "")
                    for field in FIELDS
                })


def get_game():
    game = session.get("game")

    if not game:
        return None

    return game


def log_session(game, status):
    if game.get("_session_logged"):
        return

    ensure_csv()

    started = game.get("started_timestamp", time.time())
    duration = max(0, int(time.time() - started))

    row = {
        "session_id": game.get("session_id", ""),
        "player_name": game.get("player_name", "Jucător"),
        "started_at": game.get("started_at", ""),
        "ended_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "duration_seconds": duration,
        "final_status": status,
        "last_stage": min(game.get("stage", 1), 6),
        "stages_completed": game.get("successes", 0),
        "mistakes": game.get("mistakes", 0),
        "hints": game.get("hints", 0),
        "final_difficulty": game.get("difficulty", "normal"),
    }

    with CSV_PATH.open("a", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS)
        writer.writerow(row)

    game["_session_logged"] = True


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/start")
def start():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()

    if not name:
        return jsonify({"error": "Introdu un nume pentru a începe."}), 400

    name = name[:30]

    game = new_game(name)
    session.clear()
    session["player_name"] = name
    session["game"] = game
    session.modified = True

    return jsonify(public_state(game))


@app.get("/state")
def state():
    game = get_game()

    if not game or not session.get("player_name"):
        return jsonify({"needs_name": True})

    result = public_state(game)
    result["needs_name"] = False
    return jsonify(result)


@app.post("/action")
def action():
    data = request.get_json(silent=True) or {}
    action_type = data.get("type")

    game = get_game()

    if not game or not session.get("player_name"):
        return jsonify({
            "needs_name": True,
            "error": "Introdu mai întâi numele jucătorului."
        }), 400

    if action_type == "restart":
        if game.get("status") == "won":
            log_session(game, "won")
        else:
            log_session(game, "restarted")

        name = session.get("player_name", "Jucător")
        session["game"] = new_game(name)
        session.modified = True

        return jsonify(public_state(session["game"]))

    handle_action(game, data)

    if game.get("status") == "won":
        log_session(game, "won")

    session["game"] = game
    session.modified = True

    return jsonify(public_state(game))


@app.get("/leaderboard")
def leaderboard():
    ensure_csv()
    best = {}

    with CSV_PATH.open("r", newline="", encoding="utf-8-sig") as file:
        for row in csv.DictReader(file):
            if row.get("final_status") != "won":
                continue

            name = row.get("player_name", "Jucător")

            try:
                mistakes = int(row.get("mistakes") or 0)
                duration = int(row.get("duration_seconds") or 0)
                completed = int(row.get("stages_completed") or 0)
            except ValueError:
                continue

            entry = {
                "name": name,
                "mistakes": mistakes,
                "duration": duration,
                "completed": completed,
            }

            if (
                name not in best
                or (mistakes, duration) <
                (best[name]["mistakes"], best[name]["duration"])
            ):
                best[name] = entry

    results = sorted(
        best.values(),
        key=lambda item: (
            -item["completed"],
            item["mistakes"],
            item["duration"],
        ),
    )

    return jsonify(results[:10])


@app.get("/ml-status")
def ml_status():
    return jsonify(model_status())


@app.get("/download-data")
def download_data():
    ensure_csv()

    return send_file(
        CSV_PATH,
        as_attachment=True,
        download_name="game_sessions.csv",
        mimetype="text/csv",
    )


if __name__ == "__main__":
    app.run(debug=True)
