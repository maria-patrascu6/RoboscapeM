
from flask import Flask, render_template, request, session, jsonify
from main import (
    new_game,
    get_game_view,
    move_player,
    check_answer,
    give_hint,
    advance_stage,
)
from ml_model import recommend_difficulty

app = Flask(__name__)
app.secret_key = "roboscape-prototype-change-this-key"


def current_game():
    if "game" not in session:
        session["game"] = new_game()
    return session["game"]


@app.route("/")
def index():
    current_game()
    return render_template("index.html")


@app.route("/state")
def state():
    return jsonify(get_game_view(current_game()))


@app.route("/restart", methods=["POST"])
def restart():
    session["game"] = new_game()
    return jsonify(get_game_view(session["game"]))


@app.route("/action", methods=["POST"])
def action():
    game = current_game()
    data = request.get_json(silent=True) or {}
    command = data.get("command", "")

    if game["finished"]:
        return jsonify(get_game_view(game))

    if command == "hint":
        give_hint(game)

    elif command == "move" and game["stage"] == 1:
        message = move_player(game, data.get("direction", ""))

        if message == "exit":
            difficulty = recommend_difficulty(
                game["mistakes"], game["hints"]
            )
            advance_stage(game, difficulty)
        else:
            game["message"] = message

    elif command == "answer" and game["stage"] in (2, 3, 4):
        if check_answer(game, data.get("answer", "")):
            difficulty = recommend_difficulty(
                game["mistakes"], game["hints"]
            )
            advance_stage(game, difficulty)

    session["game"] = game
    return jsonify(get_game_view(game))


if __name__ == "__main__":
    app.run(debug=True)
