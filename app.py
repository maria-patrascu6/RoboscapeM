
import csv
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, render_template, request, session, send_file

from main import new_game, handle_action, public_state
from ml_model import model_status

app = Flask(__name__)
app.secret_key = os.environ.get(
    "SECRET_KEY",
    "change-this-to-a-long-random-secret",
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
        with CSV_PATH.open("w", newline="", encoding="utf-8-sig") as file:
            writer = csv.DictWriter(file, fieldnames=FIELDS)
            writer.writeheader()


def log_session(game, status):
    if not game or game.get("_session_logged"):
        return

    try:
        ensure_csv()

        end_time = time.time()
        start_time = float(game.get("started_at", end_time))

        row = {
            "session_id": game.get("session_id", ""),
            "player_name": str(game.get("player_name") or "Jucător")[:30],
            "started_at": datetime.fromtimestamp(
                start_time, timezone.utc
            ).isoformat(),
            "ended_at": datetime.fromtimestamp(
                end_time, timezone.utc
            ).isoformat(),
            "duration_seconds": max(0, round(end_time - start_time)),
            "final_status": status,
            "last_stage": game.get("stage", 1),
            "stages_completed": game.get("successes", 0),
            "mistakes": game.get("mistakes", 0),
            "hints": game.get("hints", 0),
            "final_difficulty": game.get("difficulty", 2),
        }

        with CSV_PATH.open("a", newline="", encoding="utf-8-sig") as file:
            writer = csv.DictWriter(file, fieldnames=FIELDS)
            writer.writerow(row)

        game["_session_logged"] = True
        app.logger.info(
            "Sesiune salvată: %s (%s)",
            row["player_name"],
            status,
        )

    except (OSError, ValueError, csv.Error):
        app.logger.exception("Nu am putut salva sesiunea în CSV.")


def read_sessions():
    ensure_csv()

    with CSV_PATH.open("r", newline="", encoding="utf-8-sig") as file:
        return list(csv.DictReader(file))


def get_game():
    if "game" not in session:
        session["game"] = new_game()

    game = session["game"]
    game["player_name"] = session.get("player_name", "")
    return game


@app.get("/")
def index():
    get_game()
    return render_template("index.html")


@app.post("/start")
def start():
    data = request.get_json(silent=True) or {}
    name = " ".join(str(data.get("name", "")).split())[:30]

    if len(name) < 2:
        return jsonify({
            "error": "Introdu un nume de cel puțin 2 caractere."
        }), 400

    session["player_name"] = name

    game = new_game()
    game["player_name"] = name
    session["game"] = game
    session.modified = True

    result = public_state(game)
    result["needs_name"] = False
    return jsonify(result)


@app.get("/state")
def state():
    if not session.get("player_name"):
        return jsonify({"needs_name": True})

    result = public_state(get_game())
    result["needs_name"] = False
    return jsonify(result)


@app.post("/action")
def action():
    if not session.get("player_name"):
        return jsonify({"error": "Introdu mai întâi numele."}), 401

    game = get_game()
    data = request.get_json(silent=True) or {}

    if data.get("type") == "restart":
        status = (
            "completed"
            if game.get("status") == "won"
            else "restarted"
        )
        log_session(game, status)

        session.pop("player_name", None)
        session["game"] = new_game()
        session.modified = True

        result = public_state(session["game"])
        result["needs_name"] = True
        return jsonify(result)

    result = handle_action(game, data)

    if game.get("status") == "won":
        log_session(game, "completed")

    session["game"] = game
    session.modified = True

    result["needs_name"] = False
    return jsonify(result)


@app.get("/leaderboard")
def leaderboard():
    best = {}

    try:
        rows = read_sessions()
    except (OSError, csv.Error):
        app.logger.exception("Nu am putut citi clasamentul.")
        return jsonify([])

    for row in rows:
        name = (row.get("player_name") or "Jucător").strip()

        try:
            result = {
                "name": name,
                "completed": int(row.get("final_status") == "completed"),
                "stages": int(row.get("stages_completed") or 0),
                "mistakes": int(row.get("mistakes") or 0),
                "hints": int(row.get("hints") or 0),
                "seconds": int(row.get("duration_seconds") or 0),
            }
        except (ValueError, TypeError):
            continue

        score = (
            result["completed"],
            result["stages"],
            -result["mistakes"],
            -result["hints"],
            -result["seconds"],
        )

        if name not in best or score > best[name]["score"]:
            best[name] = {"score": score, "result": result}

    ranking = [
        item["result"]
        for item in sorted(
            best.values(),
            key=lambda item: item["score"],
            reverse=True,
        )[:20]
    ]

    return jsonify(ranking)


@app.get("/ml-status")
def ml_status():
    return jsonify(model_status())


@app.get("/download-data")
def download_data():
    try:
        ensure_csv()

        response = send_file(
            str(CSV_PATH),
            as_attachment=True,
            download_name="game_sessions.csv",
            mimetype="text/csv; charset=utf-8",
            conditional=False,
        )

        response.headers["Cache-Control"] = "no-store"
        return response

    except OSError:
        app.logger.exception("Nu am putut pregăti descărcarea CSV.")
        return jsonify({
            "error": (
                "Serverul nu poate crea sau citi CSV-ul. "
                "Verifică permisiunile și logurile Render."
            )
        }), 500


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=False,
    )
