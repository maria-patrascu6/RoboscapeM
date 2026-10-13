
import csv
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from flask import (
    Flask, jsonify, render_template, request, session, send_file
)

from main import new_game, handle_action, public_state
from ml_model import model_status

app = Flask(__name__)
app.secret_key = os.environ.get(
    "SECRET_KEY", "replace-this-with-a-long-random-secret"
)

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(
    os.environ.get("ROBOSCAPE_DATA_DIR", str(BASE_DIR / "data"))
)
CSV_PATH = DATA_DIR / "game_sessions.csv"

CSV_FIELDS = [
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
        with CSV_PATH.open("w", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=CSV_FIELDS)
            writer.writeheader()
        return

    try:
        with CSV_PATH.open("r", newline="", encoding="utf-8") as file:
            reader = csv.DictReader(file)
            old_fields = reader.fieldnames or []
            rows = list(reader)

        if old_fields != CSV_FIELDS:
            with CSV_PATH.open("w", newline="", encoding="utf-8") as file:
                writer = csv.DictWriter(file, fieldnames=CSV_FIELDS)
                writer.writeheader()

                for row in rows:
                    writer.writerow({
                        field: row.get(field, "")
                        for field in CSV_FIELDS
                    })

    except (OSError, csv.Error) as error:
        app.logger.error("Eroare CSV: %s", error)


def log_session(game, status):
    if not game or game.get("_session_logged"):
        return

    try:
        ensure_csv()

        ended = time.time()
        started = float(game.get("started_at", ended))

        row = {
            "session_id": game.get("session_id", ""),
            "player_name": str(
                game.get("player_name") or "Jucător"
            ).strip()[:30],
            "started_at": datetime.fromtimestamp(
                started, timezone.utc
            ).isoformat(),
            "ended_at": datetime.fromtimestamp(
                ended, timezone.utc
            ).isoformat(),
            "duration_seconds": max(0, round(ended - started)),
            "final_status": status,
            "last_stage": game.get("stage", 1),
            "stages_completed": game.get("successes", 0),
            "mistakes": game.get("mistakes", 0),
            "hints": game.get("hints", 0),
            "final_difficulty": game.get("difficulty", 2),
        }

        with CSV_PATH.open("a", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=CSV_FIELDS)
            writer.writerow(row)

        game["_session_logged"] = True

    except Exception:
        app.logger.exception("Nu am putut salva sesiunea.")


def get_game():
    if "game" not in session:
        session["game"] = new_game()

    game = session["game"]
    game["player_name"] = session.get("player_name", "")
    return game


def read_sessions():
    if not CSV_PATH.exists():
        return []

    try:
        with CSV_PATH.open("r", newline="", encoding="utf-8") as file:
            return list(csv.DictReader(file))
    except (OSError, csv.Error):
        return []


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
            "error": "Introdu un nume sau o poreclă de cel puțin 2 caractere."
        }), 400

    # Fiecare nume nou primește o misiune și un ID nou.
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
        # Salvează misiunea precedentă o singură dată.
        status = (
            "completed"
            if game.get("status") == "won"
            else "restarted"
        )
        log_session(game, status)

        # Elimină numele precedent și pregătește ecranul de start.
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


@app.post("/restart")
def restart():
    # Rută alternativă pentru a reveni la formularul de nume.
    old_game = session.get("game")

    if old_game and session.get("player_name"):
        status = (
            "completed"
            if old_game.get("status") == "won"
            else "restarted"
        )
        log_session(old_game, status)

    session.pop("player_name", None)
    session["game"] = new_game()
    session.modified = True

    result = public_state(session["game"])
    result["needs_name"] = True
    return jsonify(result)


@app.get("/leaderboard")
def leaderboard():
    best = {}

    for row in read_sessions():
        name = (
            row.get("player_name") or "Jucător"
        ).strip() or "Jucător"

        try:
            result = {
                "name": name,
                "completed": int(
                    row.get("final_status") == "completed"
                ),
                "stages": int(row.get("stages_completed") or 0),
                "mistakes": int(row.get("mistakes") or 0),
                "hints": int(row.get("hints") or 0),
                "seconds": int(row.get("duration_seconds") or 0),
            }
        except (TypeError, ValueError):
            continue

        score = (
            result["completed"],
            result["stages"],
            -result["mistakes"],
            -result["hints"],
            -result["seconds"],
        )

        if name not in best or score > best[name]["_score"]:
            result["_score"] = score
            best[name] = result

    ranking = sorted(
        best.values(),
        key=lambda item: item["_score"],
        reverse=True,
    )[:20]

    for item in ranking:
        item.pop("_score", None)

    return jsonify(ranking)


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
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=False,
    )
