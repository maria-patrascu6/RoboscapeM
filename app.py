
import os
from flask import Flask, jsonify, render_template, request, session
from main import new_game, handle_action, public_state

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "roboscape-prototype-key-change-me")


def get_game():
    if "game" not in session:
        session["game"] = new_game()
    return session["game"]


@app.get("/")
def index():
    get_game()
    return render_template("index.html")


@app.get("/state")
def state():
    game = get_game()
    handle_action(game, {"type": "tick"})
    session["game"] = game
    return jsonify(public_state(game))


@app.post("/action")
def action():
    game = get_game()
    data = request.get_json(silent=True) or {}
    result = handle_action(game, data)
    session["game"] = game
    session.modified = True
    return jsonify(result)


@app.post("/restart")
def restart():
    session["game"] = new_game()
    session.modified = True
    return jsonify(public_state(session["game"]))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
