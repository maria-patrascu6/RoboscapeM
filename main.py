
import random
import time

from ml_model import predict_difficulty


# Exact 6 forme pentru jocul de memorie.
SYMBOLS = ["▲", "●", "■", "◆", "★", "⬟"]

STAGE_NAMES = {
    1: "Labirintul",
    2: "Bomba reactorului",
    3: "Conectarea cablurilor",
    4: "Grila de securitate",
    5: "Codul logic",
    6: "Continuitatea circuitului",
}

STAGE_DESCRIPTIONS = {
    1: "Găsește drumul spre ieșirea din labirint.",
    2: "Memorează secvența pentru a dezamorsa bomba.",
    3: "Glisează cablurile în ordinea corectă.",
    4: "Urmează traseul sigur prin grila de securitate.",
    5: "Rezolvă problema logică pentru a debloca accesul.",
    6: "Rotește piesele până când circuitul se conectează.",
}

# 0 = liber, 1 = perete
MAZE = [
    [0, 0, 1, 0, 0],
    [1, 0, 1, 0, 1],
    [0, 0, 0, 0, 1],
    [0, 1, 1, 0, 1],
    [0, 0, 0, 0, 0],
]

SAFE_PATH = [0, 1, 6, 11, 12, 13, 18, 23, 24]


def get_ports(tile):
    rotation = tile["rotation"] % 4

    if tile["kind"] == "straight":
        if rotation % 2 == 0:
            return {"N", "S"}
        return {"E", "W"}

    elbows = [
        {"N", "E"},
        {"E", "S"},
        {"S", "W"},
        {"W", "N"},
    ]

    return elbows[rotation]


def create_circuit():
    solution = [0, 1, 2, 3, 7, 11, 15]

    target_rotations = {
        0: 1,
        1: 1,
        2: 1,
        3: 2,
        7: 0,
        11: 0,
        15: 0,
    }

    tiles = []

    for index in range(16):
        kind = "elbow" if index == 3 else "straight"
        rotation = random.randrange(4)

        if index in solution:
            target_rotation = target_rotations[index]
            target_ports = get_ports({
                "kind": kind,
                "rotation": target_rotation,
            })

            while get_ports({
                "kind": kind,
                "rotation": rotation,
            }) == target_ports:
                rotation = random.randrange(4)

        tiles.append({
            "kind": kind,
            "rotation": rotation,
        })

    return tiles


def new_game(player_name):
    game = {
        "player_name": player_name,
        "stage": 1,
        "status": "playing",
        "difficulty": "normal",
        "mistakes": 0,
        "hints": 0,
        "successes": 0,
        "started_at": time.time(),
        "stage_started_at": time.time(),
        "feedback": "Misiunea începe. Succes!",
        "maze": [row[:] for row in MAZE],
        "maze_player": [0, 0],
        "grid_player": 0,
        "grid": [1 if i in SAFE_PATH else 0 for i in range(25)],
        "bomb_sequence": [],
        "bomb_phase": "show",
        "bomb_index": 0,
        "bomb_reveal_until": 0,
        "wire_target": [0, 1, 2, 3],
        "wire_colors": ["Roșu", "Albastru", "Galben", "Verde"],
        "logic_question": "",
        "logic_answer": 0,
        "circuit": [],
        "circuit_connected": False,
        "_session_logged": False,
    }

    enter_stage(game, 1)
    return game


def enter_stage(game, stage):
    game["stage"] = stage
    game["stage_started_at"] = time.time()
    game["feedback"] = STAGE_DESCRIPTIONS.get(stage, "")

    if stage == 2:
        lengths = {
            "easy": 4,
            "normal": 6,
            "hard": 9,
        }
        length = lengths.get(game["difficulty"], 6)

        game["bomb_sequence"] = [
            random.choice(SYMBOLS) for _ in range(length)
        ]
        game["bomb_phase"] = "show"
        game["bomb_index"] = 0
        game["bomb_reveal_until"] = (
            time.time() + 3 + length * 0.6
        )

    elif stage == 3:
        game["wire_target"] = [0, 1, 2, 3]
        random.shuffle(game["wire_target"])

        if game["wire_target"] == [0, 1, 2, 3]:
            game["wire_target"] = [2, 0, 3, 1]

    elif stage == 5:
        game["logic_question"] = (
            "Un robot are 3 baterii. Fiecare baterie "
            "alimentează 2 module. Câte module pot fi "
            "alimentate simultan?"
        )
        game["logic_answer"] = 6

    elif stage == 6:
        game["circuit"] = create_circuit()
        game["circuit_connected"] = False


def public_state(game):
    if (
        game["stage"] == 2
        and game["bomb_phase"] == "show"
        and time.time() >= game["bomb_reveal_until"]
    ):
        game["bomb_phase"] = "input"
        game["bomb_index"] = 0
        game["feedback"] = (
            "Secvența a dispărut! Introdu simbolurile în ordine."
        )

    elapsed = int(time.time() - game["started_at"])

    state = {
        "player_name": game["player_name"],
        "stage": game["stage"],
        "stage_name": STAGE_NAMES.get(game["stage"], "Final"),
        "stage_description": STAGE_DESCRIPTIONS.get(
            game["stage"], ""
        ),
        "status": game["status"],
        "difficulty": game["difficulty"],
        "mistakes": game["mistakes"],
        "hints": game["hints"],
        "successes": game["successes"],
        "elapsed_seconds": elapsed,
        "feedback": game["feedback"],
        "maze": game["maze"],
        "maze_player": game["maze_player"],
        "grid": game["grid"],
        "grid_player": game["grid_player"],
        "bomb_phase": game["bomb_phase"],
        "bomb_index": game["bomb_index"],
        "bomb_length": len(game["bomb_sequence"]),
        "wire_target": game["wire_target"],
        "wire_colors": game["wire_colors"],
        "logic_question": game["logic_question"],
        "circuit": game["circuit"],
        "circuit_connected": game["circuit_connected"],
    }

    if game["stage"] == 2 and game["bomb_phase"] == "show":
        state["bomb_sequence"] = game["bomb_sequence"]
    else:
        state["bomb_sequence"] = []

    return state


def advance_stage(game):
    game["successes"] += 1

    elapsed = time.time() - game["started_at"]

    game["difficulty"] = predict_difficulty(
        mistakes=game["mistakes"],
        hints=game["hints"],
        successes=game["successes"],
        stage=game["stage"],
        elapsed_seconds=elapsed,
        current_difficulty=game["difficulty"],
    )

    next_stage = game["stage"] + 1

    if next_stage > 6:
        game["stage"] = 7
        game["status"] = "won"
        game["feedback"] = (
            "Felicitări! Ai terminat toate cele șase etape."
        )
        return

    enter_stage(game, next_stage)


def move_player(game, dx, dy):
    if game["stage"] == 1:
        row, col = game["maze_player"]
        nr, nc = row + dy, col + dx

        if not (0 <= nr < 5 and 0 <= nc < 5):
            return

        if game["maze"][nr][nc] == 1:
            game["feedback"] = "Drumul este blocat."
            return

        game["maze_player"] = [nr, nc]

        if [nr, nc] == [4, 4]:
            game["feedback"] = "Ai găsit ieșirea!"
            advance_stage(game)

    elif game["stage"] == 4:
        row, col = divmod(game["grid_player"], 5)
        nr, nc = row + dy, col + dx

        if not (0 <= nr < 5 and 0 <= nc < 5):
            return

        target = nr * 5 + nc

        if target not in SAFE_PATH:
            game["mistakes"] += 1
            game["feedback"] = (
                "Celulă nesigură! Încearcă altă direcție."
            )
            return

        game["grid_player"] = target

        if target == 24:
            game["feedback"] = "Ai trecut de grila de securitate!"
            advance_stage(game)


def circuit_has_path(tiles):
    if len(tiles) != 16:
        return False

    queue = [0]
    visited = {0}

    directions = {
        "N": (-1, 0, "S"),
        "E": (0, 1, "W"),
        "S": (1, 0, "N"),
        "W": (0, -1, "E"),
    }

    while queue:
        current = queue.pop(0)

        if current == 15:
            return True

        row, col = divmod(current, 4)

        for direction, (dr, dc, opposite) in directions.items():
            if direction not in get_ports(tiles[current]):
                continue

            nr, nc = row + dr, col + dc

            if not (0 <= nr < 4 and 0 <= nc < 4):
                continue

            neighbor = nr * 4 + nc

            if opposite not in get_ports(tiles[neighbor]):
                continue

            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)

    return False


def handle_action(game, data):
    if game["status"] != "playing":
        return

    kind = data.get("type", "")

    if kind == "maze_move" and game["stage"] == 1:
        move_player(
            game,
            int(data.get("dx", 0)),
            int(data.get("dy", 0)),
        )

    elif kind == "grid_move" and game["stage"] == 4:
        move_player(
            game,
            int(data.get("dx", 0)),
            int(data.get("dy", 0)),
        )

    elif kind == "bomb_pick" and game["stage"] == 2:
        if game["bomb_phase"] != "input":
            return

        symbol = data.get("symbol", "")
        index = game["bomb_index"]

        if index >= len(game["bomb_sequence"]):
            return

        if symbol != game["bomb_sequence"][index]:
            game["mistakes"] += 1
            game["bomb_sequence"] = [
                random.choice(SYMBOLS)
                for _ in range(len(game["bomb_sequence"]))
            ]
            game["bomb_phase"] = "show"
            game["bomb_index"] = 0
            game["bomb_reveal_until"] = (
                time.time()
                + 3
                + len(game["bomb_sequence"]) * 0.6
            )
            game["feedback"] = (
                "Simbol greșit! Memorează noua secvență."
            )
            return

        game["bomb_index"] += 1

        if game["bomb_index"] == len(game["bomb_sequence"]):
            game["feedback"] = "Bombă dezamorsată!"
            advance_stage(game)
        else:
            game["feedback"] = "Corect! Continuă."

    elif kind == "wire_solved" and game["stage"] == 3:
        advance_stage(game)

    elif kind == "wire_wrong" and game["stage"] == 3:
        game["mistakes"] += 1
        game["feedback"] = (
            "Ordinea nu este corectă. Mai încearcă!"
        )

    elif kind == "logic_submit" and game["stage"] == 5:
        try:
            answer = int(data.get("answer", ""))
        except (ValueError, TypeError):
            answer = None

        if answer == game["logic_answer"]:
            game["feedback"] = "Răspuns corect!"
            advance_stage(game)
        else:
            game["mistakes"] += 1
            game["feedback"] = (
                "Răspuns greșit. Încearcă din nou."
            )

    elif kind == "circuit_rotate" and game["stage"] == 6:
        try:
            index = int(data.get("index", -1))
        except (ValueError, TypeError):
            return

        if not 0 <= index < len(game["circuit"]):
            return

        game["circuit"][index]["rotation"] = (
            game["circuit"][index]["rotation"] + 1
        ) % 4

        if circuit_has_path(game["circuit"]):
            game["circuit_connected"] = True
            game["feedback"] = "Circuit conectat!"
            advance_stage(game)
        else:
            game["circuit_connected"] = False
            game["feedback"] = (
                "Circuitul nu este încă legat complet."
            )

    elif kind == "hint":
        game["hints"] += 1

        hints = {
            1: "Urmează coridorul liber până la ieșire.",
            2: "Reține forma și ordinea fiecărui simbol.",
            3: "Glisează fiecare cablu pe poziția numerotată corect.",
            4: "Deplasează-te numai pe celulele sigure.",
            5: "Înmulțește numărul bateriilor cu modulele fiecăreia.",
            6: "Rotește piesele pentru a conecta ieșirile vecine.",
        }

        game["feedback"] = hints.get(
            game["stage"], "Continuă să încerci!"
        )

    elif kind == "tick" and game["stage"] == 2:
        pass
