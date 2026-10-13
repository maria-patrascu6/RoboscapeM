
import os
from flask import Flask, jsonify, render_template, request, session
from main import new_game, handle_action, public_state

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "change-this-roboscape-secret")
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax"
)


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
    result = public_state(game)
    session["game"] = game
    session.modified = True
    return jsonify(result)


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
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=False
    )
