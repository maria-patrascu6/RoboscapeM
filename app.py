
import csv
import os
import time
import uuid
from pathlib import Path

from flask import (
    Flask,
    jsonify,
    render_template,
    request,
    session,
    send_file,
)

from main import new_game, public_state, handle_action
from ml_model import model_status


app = Flask(__name__)
app.secret_key = os.environ.get(
    "SECRET_KEY", "roboscape-development-key-change-me"
)

DATA_DIR = Path(
    os.environ.get("ROBOSCAPE_DATA_DIR", "/tmp/roboscape_data")
)
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
        with CSV_PATH.open(
            "w", newline="", encoding="utf-8-sig"
        ) as file:
            writer = csv.DictWriter(file, fieldnames=FIELDS)
            writer.writeheader()
        return

    try:
        with CSV_PATH.open(
            "r", newline="", encoding="utf-8-sig"
        ) as file:
            reader = csv.DictReader(file)
            old_fields = reader.fieldnames or []
            rows = list(reader)

        if old_fields != FIELDS:
            with CSV_PATH.open(
                "w", newline="", encoding="utf-8-sig"
            ) as file:
                writer = csv.DictWriter(file, fieldnames=FIELDS)
                writer.writeheader()

                for row in rows:
                    writer.writerow({
                        field: row.get(field, "")
                        for field in FIELDS
                    })

    except (OSError, csv.Error):
        app.logger.exception("Nu am putut verifica fișierul CSV.")
        raise


def get_game():
    game = session.get("game")

    if not isinstance(game, dict):
        return None

    return game


def save_game(game):
    session["game"] = game
    session.modified = True


def log_session(game, status):
    if game.get("_session_logged"):
        return

    try:
        ensure_csv()

        now = time.time()
        started = float(game.get("started_at", now))
        duration = max(0, int(now - started))
        last_stage = min(int(game.get("stage", 1)), 6)

        row = {
            "session_id": str(uuid.uuid4()),
            "player_name": game.get("player_name", "Jucător"),
            "started_at": time.strftime(
                "%Y-%m-%d %H:%M:%S",
                time.localtime(started),
            ),
            "ended_at": time.strftime(
                "%Y-%m-%d %H:%M:%S",
                time.localtime(now),
            ),
            "duration_seconds": duration,
            "final_status": status,
            "last_stage": last_stage,
            "stages_completed": (
                6 if status == "won" else max(0, last_stage - 1)
            ),
            "mistakes": game.get("mistakes", 0),
            "hints": game.get("hints", 0),
            "final_difficulty": game.get("difficulty", "normal"),
        }

        with CSV_PATH.open(
            "a", newline="", encoding="utf-8-sig"
        ) as file:
            writer = csv.DictWriter(file, fieldnames=FIELDS)
            writer.writerow(row)

        game["_session_logged"] = True

    except Exception:
        app.logger.exception("Nu am putut salva sesiunea în CSV.")


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/start")
def start():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    name = name[:30]

    if not name:
        return jsonify({
            "error": "Introdu un nume înainte să începi."
        }), 400

    old_game = get_game()

    if old_game and not old_game.get("_session_logged"):
        log_session(old_game, "restarted")

    game = new_game(name)
    session["player_name"] = name
    save_game(game)

    return jsonify(public_state(game))


@app.get("/state")
def state():
    if not session.get("player_name"):
        return jsonify({"needs_name": True})

    game = get_game()

    if game is None:
        return jsonify({"needs_name": True})

    result = public_state(game)
    save_game(game)

    result["needs_name"] = False
    return jsonify(result)


@app.post("/action")
def action():
    if not session.get("player_name"):
        return jsonify({"needs_name": True}), 401

    game = get_game()

    if game is None:
        return jsonify({"needs_name": True}), 401

    data = request.get_json(silent=True) or {}
    action_type = data.get("type", "")

    if action_type == "restart":
        log_session(
            game,
            "won" if game.get("status") == "won" else "restarted",
        )

        session.pop("game", None)
        session.pop("player_name", None)

        return jsonify({"needs_name": True})

    handle_action(game, data)

    if game.get("status") == "won":
        log_session(game, "won")

    save_game(game)

    return jsonify(public_state(game))


@app.get("/leaderboard")
def leaderboard():
    ensure_csv()

    best_scores = {}

    try:
        with CSV_PATH.open(
            "r", newline="", encoding="utf-8-sig"
        ) as file:
            reader = csv.DictReader(file)

            for row in reader:
                name = row.get("player_name", "").strip()

                if not name:
                    continue

                try:
                    completed = int(row.get("stages_completed") or 0)
                    duration = int(row.get("duration_seconds") or 0)
                    mistakes = int(row.get("mistakes") or 0)
                except ValueError:
                    continue

                score = (completed, -mistakes, -duration)

                if (
                    name not in best_scores
                    or score > best_scores[name]["score"]
                ):
                    best_scores[name] = {
                        "name": name,
                        "completed": completed,
                        "duration": duration,
                        "mistakes": mistakes,
                        "score": score,
                    }

    except (OSError, csv.Error):
        app.logger.exception("Nu am putut citi clasamentul.")

    results = sorted(
        best_scores.values(),
        key=lambda item: item["score"],
        reverse=True,
    )[:10]

    for item in results:
        item.pop("score", None)

    return jsonify(results)


@app.get("/ml-status")
def ml_status():
    return jsonify(model_status())


@app.get("/download-data")
def download_data():
    try:
        ensure_csv()

        return send_file(
            CSV_PATH,
            mimetype="text/csv",
            as_attachment=True,
            download_name="game_sessions.csv",
            max_age=0,
        )

    except Exception:
        app.logger.exception("Nu am putut pregăti descărcarea CSV.")

        return jsonify({
            "error": (
                "Nu am putut pregăti fișierul CSV. "
                "Verifică logurile aplicației pe Render."
            )
        }), 500


if __name__ == "__main__":
    app.run(debug=True)
