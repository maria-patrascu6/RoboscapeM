
import random
import time
from datetime import datetime

from ml_model import predict_difficulty


SYMBOLS = ["▲", "●", "■", "◆", "★", "⬟"]

STAGES = {
    1: "Labirintul",
    2: "Bomba reactorului",
    3: "Conectarea cablurilor",
    4: "Grila de securitate",
    5: "Codul logic",
    6: "Continuitatea circuitului",
}

STAGE_DESCRIPTIONS = {
    1: "Găsește drumul până la ieșirea din labirint.",
    2: "Memorează secvența de forme și repet-o corect.",
    3: "Glisează cablurile în ordinea indicată.",
    4: "Traversează grila folosind numai celulele sigure.",
    5: "Rezolvă șirul logic pentru a debloca ușa.",
    6: "Rotește piesele până când circuitul este complet.",
}

MAZE = [
    [0, 0, 1, 0, 0],
    [1, 0, 1, 0, 1],
    [0, 0, 0, 0, 1],
    [0, 1, 1, 0, 1],
    [0, 0, 0, 0, 0],
]

SAFE_PATH = [0, 1, 6, 11, 12, 13, 18, 23, 24]


def new_game(player_name):
    game = {
        "session_id": str(uuid_value()),
        "player_name": player_name,
        "started_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "started_timestamp": time.time(),
        "stage": 1,
        "status": "playing",
        "difficulty": "normal",
        "mistakes": 0,
        "hints": 0,
        "successes": 0,
        "feedback": "Misiune începută. Mult succes!",
        "hint": "",
        "maze_player": 0,
        "grid_player": 0,
        "bomb_sequence": [],
        "bomb_phase": "show",
        "bomb_index": 0,
        "bomb_reveal_until": 0,
        "wire_target": [],
        "logic_answer": 17,
        "circuit_target": [0, 1, 2, 1, 0, 2],
        "circuit_rotations": [
            random.randint(0, 3) for _ in range(6)
        ],
        "_session_logged": False,
    }

    enter_stage(game, 1)
    return game


def uuid_value():
    import uuid
    return uuid.uuid4().hex


def enter_stage(game, stage):
    game["stage"] = stage
    game["hint"] = ""

    if stage > 6:
        game["status"] = "won"
        game["feedback"] = "Felicitări! Ai evadat din RoboScape!"
        return

    game["feedback"] = STAGE_DESCRIPTIONS[stage]

    if stage == 1:
        game["maze_player"] = 0

    elif stage == 2:
        difficulty = game["difficulty"]
        length = 4 if difficulty == "easy" else 6
        if difficulty == "hard":
            length = 9

        game["bomb_sequence"] = [
            random.choice(SYMBOLS) for _ in range(length)
        ]
        game["bomb_phase"] = "show"
        game["bomb_index"] = 0
        game["bomb_reveal_until"] = time.time() + 4 + length * 0.35

    elif stage == 3:
        target = [0, 1, 2, 3]
        random.shuffle(target)

        if target == [0, 1, 2, 3]:
            target = [2, 0, 3, 1]

        game["wire_target"] = target

    elif stage == 4:
        game["grid_player"] = 0

    elif stage == 5:
        game["logic_answer"] = 17

    elif stage == 6:
        game["circuit_target"] = [0, 1, 2, 1, 0, 2]
        game["circuit_rotations"] = [
            random.randint(0, 3) for _ in range(6)
        ]


def advance_stage(game):
    game["successes"] += 1

    elapsed = int(time.time() - game["started_timestamp"])

    game["difficulty"] = predict_difficulty(
        mistakes=game["mistakes"],
        hints=game["hints"],
        successes=game["successes"],
        stage=game["stage"],
        elapsed_seconds=elapsed,
        current_difficulty=game["difficulty"],
    )

    enter_stage(game, game["stage"] + 1)


def public_state(game):
    if (
        game["stage"] == 2
        and game["bomb_phase"] == "show"
        and time.time() >= game["bomb_reveal_until"]
    ):
        game["bomb_phase"] = "input"
        game["feedback"] = "Acum repetă secvența memorată!"

    result = {
        "player_name": game["player_name"],
        "stage": game["stage"],
        "status": game["status"],
        "difficulty": game["difficulty"],
        "mistakes": game["mistakes"],
        "hints": game["hints"],
        "successes": game["successes"],
        "feedback": game["feedback"],
        "hint": game["hint"],
        "stage_name": STAGES.get(game["stage"], "Misiune terminată"),
        "stage_description": STAGE_DESCRIPTIONS.get(game["stage"], ""),
        "maze": MAZE,
        "maze_player": game["maze_player"],
        "safe_path": SAFE_PATH,
        "grid_player": game["grid_player"],
        "symbols": SYMBOLS,
        "bomb_phase": game["bomb_phase"],
        "bomb_index": game["bomb_index"],
        "bomb_length": len(game["bomb_sequence"]),
        "wire_target": game["wire_target"],
        "wire_colors": ["Roșu", "Albastru", "Galben", "Verde"],
        "circuit_rotations": game["circuit_rotations"],
        "circuit_target": game["circuit_target"],
    }

    if game["stage"] == 2 and game["bomb_phase"] == "show":
        result["bomb_sequence"] = game["bomb_sequence"]
    else:
        result["bomb_sequence"] = []

    return result


def move_on_board(game, direction, board_type):
    if board_type == "maze":
        position = game["maze_player"]
        row, col = divmod(position, 5)

        if direction == "up":
            row -= 1
        elif direction == "down":
            row += 1
        elif direction == "left":
            col -= 1
        elif direction == "right":
            col += 1

        if row < 0 or row > 4 or col < 0 or col > 4:
            return

        if MAZE[row][col] == 1:
            game["feedback"] = "Drumul este blocat. Încearcă altă direcție."
            return

        game["maze_player"] = row * 5 + col

        if game["maze_player"] == 24:
            game["feedback"] = "Ai găsit ieșirea!"
            advance_stage(game)

    elif board_type == "grid":
        position = game["grid_player"]
        row, col = divmod(position, 5)

        if direction == "up":
            row -= 1
        elif direction == "down":
            row += 1
        elif direction == "left":
            col -= 1
        elif direction == "right":
            col += 1

        if row < 0 or row > 4 or col < 0 or col > 4:
            return

        new_position = row * 5 + col

        if new_position not in SAFE_PATH:
            game["mistakes"] += 1
            game["feedback"] = "Celulă nesigură! Încearcă alt traseu."
            return

        game["grid_player"] = new_position

        if new_position == 24:
            game["feedback"] = "Grila a fost traversată!"
            advance_stage(game)


def handle_action(game, data):
    if game["status"] != "playing":
        return

    action_type = data.get("type")
    value = data.get("value")

    if action_type == "maze_move" and game["stage"] == 1:
        move_on_board(game, value, "maze")

    elif action_type == "grid_move" and game["stage"] == 4:
        move_on_board(game, value, "grid")

    elif action_type == "bomb_pick" and game["stage"] == 2:
        if game["bomb_phase"] == "show":
            game["feedback"] = "Așteaptă până când secvența dispare."
            return

        sequence = game["bomb_sequence"]
        index = game["bomb_index"]

        if index >= len(sequence):
            return

        if value == sequence[index]:
            game["bomb_index"] += 1
            game["feedback"] = "Corect!"

            if game["bomb_index"] >= len(sequence):
                game["feedback"] = "Bombă dezamorsată!"
                advance_stage(game)
        else:
            game["mistakes"] += 1
            game["feedback"] = "Secvență greșită. Memorează noua secvență."
            game["bomb_sequence"] = [
                random.choice(SYMBOLS) for _ in range(len(sequence))
            ]
            game["bomb_phase"] = "show"
            game["bomb_index"] = 0
            game["bomb_reveal_until"] = (
                time.time() + 4 + len(game["bomb_sequence"]) * 0.35
            )

    elif action_type == "wire_submit" and game["stage"] == 3:
        try:
            order = [int(item) for item in value]
        except (TypeError, ValueError):
            return

        if order == game["wire_target"]:
            game["feedback"] = "Cablurile sunt conectate corect!"
            advance_stage(game)
        else:
            game["mistakes"] += 1
            game["feedback"] = "Ordinea nu este corectă. Mai încearcă."

    elif action_type == "logic_submit" and game["stage"] == 5:
        try:
            answer = int(value)
        except (TypeError, ValueError):
            game["feedback"] = "Introdu un număr valid."
            return

        if answer == game["logic_answer"]:
            game["feedback"] = "Cod logic rezolvat!"
            advance_stage(game)
        else:
            game["mistakes"] += 1
            game["feedback"] = "Răspuns greșit. Încearcă din nou."

    elif action_type == "circuit_rotate" and game["stage"] == 6:
        try:
            index = int(value)
        except (TypeError, ValueError):
            return

        if 0 <= index < len(game["circuit_rotations"]):
            game["circuit_rotations"][index] = (
                game["circuit_rotations"][index] + 1
            ) % 4

            if game["circuit_rotations"] == game["circuit_target"]:
                game["feedback"] = "Circuit complet!"
                advance_stage(game)
            else:
                game["feedback"] = "Rotește piesele până se aliniază."

    elif action_type == "hint":
        game["hints"] += 1

        hints = {
            1: "În labirint, deplasează-te cu săgețile. Câmpurile închise nu pot fi traversate.",
            2: "Reține formele de la stânga la dreapta, apoi apasă-le în aceeași ordine.",
            3: "Compară cablurile cu ordinea indicată și glisează-le în pozițiile potrivite.",
            4: "Urmează traseul sigur de la colțul stânga-sus la colțul dreapta-jos.",
            5: "Diferențele sunt +1, +2, +3, +4. Continuă cu următoarea diferență.",
            6: "Fiecare piesă are patru orientări. Apasă o piesă pentru a o roti.",
        }

        game["hint"] = hints.get(game["stage"], "")
