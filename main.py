
import random
import time
import uuid
from collections import deque

from ml_model import predict_difficulty

MAZE_SIZE = 7
GRID_SIZE = 5

# Opt forme distincte pentru testul de memorie.
SYMBOLS = ["▲", "●", "■", "◆", "★", "⬟", "✚", "⬢"]

COLORS = [
    "Albastru", "Galben", "Mov", "Verde", "Roșu"
]

MAZE_WALLS = [
    [0, 2], [0, 3], [0, 5], [1, 1], [1, 3], [1, 5],
    [2, 1], [2, 2], [2, 5], [3, 3], [3, 4], [3, 5],
    [4, 1], [4, 3], [5, 1], [5, 5], [6, 2], [6, 3], [6, 5],
]

GRID_WALLS = [
    [0, 2], [1, 0], [1, 2], [1, 4], [3, 1], [3, 2],
]

LOGIC_QUESTIONS = [
    {"question": "Completează: 2, 6, 18, 54, ?", "answer": 162},
    {"question": "Completează: 1, 4, 9, 16, 25, ?", "answer": 36},
    {"question": "Completează: 3, 8, 15, 24, 35, ?", "answer": 48},
    {"question": "Completează: 2, 3, 5, 8, 13, ?", "answer": 21},
    {"question": "Completează: 1, 2, 6, 24, 120, ?", "answer": 720},
    {"question": "Completează: 81, 27, 9, 3, ?", "answer": 1},
    {"question": "Completează: 4, 9, 19, 39, 79, ?", "answer": 159},
    {"question": "Completează: 2, 5, 11, 23, 47, ?", "answer": 95},
]

DIFFICULTY_NAMES = {1: "Ușor", 2: "Mediu", 3: "Dificil"}

DIRECTIONS = {
    "N": (-1, 0, "S"),
    "E": (0, 1, "W"),
    "S": (1, 0, "N"),
    "W": (0, -1, "E"),
}


def update_difficulty(game):
    elapsed = int(time.time() - game["started_at"])

    game["difficulty"] = predict_difficulty(
        game["mistakes"],
        game["hints"],
        game["successes"],
        stage=game["stage"],
        elapsed_seconds=elapsed,
        current_difficulty=game["difficulty"],
    )


def get_ports(tile):
    rotation = tile["rotation"] % 4

    if tile["kind"] == "straight":
        return {"N", "S"} if rotation % 2 == 0 else {"E", "W"}

    # Cotul de bază este N-E. Fiecare rotație îl întoarce 90°.
    elbows = [
        {"N", "E"},
        {"E", "S"},
        {"S", "W"},
        {"W", "N"},
    ]
    return elbows[rotation]


def circuit_is_connected(tiles):
    if len(tiles) != 16:
        return False

    start = (0, 0)
    target = (3, 3)
    queue = deque([start])
    visited = {start}

    while queue:
        r, c = queue.popleft()

        if (r, c) == target:
            return True

        ports = get_ports(tiles[r * 4 + c])

        for port in ports:
            dr, dc, opposite = DIRECTIONS[port]
            nr, nc = r + dr, c + dc

            if not (0 <= nr < 4 and 0 <= nc < 4):
                continue

            if opposite not in get_ports(tiles[nr * 4 + nc]):
                continue

            if (nr, nc) not in visited:
                visited.add((nr, nc))
                queue.append((nr, nc))

    return False


def create_circuit(game):
    # Traseul corect: trei segmente orizontale,
    # un cot în dreapta sus și trei segmente verticale.
    solution = {
        0: ("straight", 1),  # E-W
        1: ("straight", 1),
        2: ("straight", 1),
        3: ("elbow", 1),     # E-S
        7: ("straight", 0),  # N-S
        11: ("straight", 0),
        15: ("straight", 0),
    }

    tiles = []

    for index in range(16):
        if index in solution:
            kind, target_rotation = solution[index]
        else:
            kind = random.choice(["straight", "elbow"])
            target_rotation = random.randrange(4)

        rotation = random.randrange(4)

        # Evită ca piesele traseului să pornească deja
        # exact în orientarea soluției.
        if index in solution:
            while rotation == target_rotation:
                rotation = random.randrange(4)

        tiles.append({
            "kind": kind,
            "rotation": rotation,
        })

    game["circuit"] = tiles


def enter_stage(game, stage):
    game["stage"] = stage
    game["feedback"] = ""

    if stage == 1:
        game["stage_name"] = "Labirintul navei"
        game["maze_pos"] = [0, 0]

    elif stage == 2:
        game["stage_name"] = "Dezactivarea bombei"

        # Secvența se schimbă la fiecare misiune.
        # Dificultatea determină numărul de simboluri.
        length = {1: 4, 2: 6, 3: 8}[game["difficulty"]]
        game["bomb_sequence"] = [
            random.choice(SYMBOLS) for _ in range(length)
        ]
        game["bomb_phase"] = "show"
        game["bomb_show_until"] = time.time() + 5
        game["bomb_deadline"] = 0
        game["bomb_input"] = []

    elif stage == 3:
        game["stage_name"] = "Panoul de cabluri"
        count = 5 if game["difficulty"] == 3 else 4
        game["colors"] = COLORS[:count]
        game["wire_target"] = random.sample(range(count), count)
        while game["wire_target"] == list(range(count)):
            game["wire_target"] = random.sample(range(count), count)

    elif stage == 4:
        game["stage_name"] = "Grila de securitate"
        game["grid_pos"] = [0, 0]

    elif stage == 5:
        game["stage_name"] = "Terminalul logic"
        question = random.choice(LOGIC_QUESTIONS)
        game["logic_question"] = question["question"]
        game["logic_answer"] = question["answer"]

    elif stage == 6:
        game["stage_name"] = "Circuitul de evacuare"
        create_circuit(game)

    else:
        game["stage"] = 7
        game["stage_name"] = "Misiune finalizată"
        game["status"] = "won"
        game["feedback"] = "Felicitări! Ai terminat toate cele șase etape."


def advance_stage(game):
    game["successes"] += 1

    if game["stage"] < 6:
        update_difficulty(game)

    enter_stage(game, game["stage"] + 1)


def new_game():
    game = {
        "session_id": str(uuid.uuid4()),
        "started_at": time.time(),
        "_session_logged": False,
        "stage": 1,
        "stage_name": "",
        "status": "playing",
        "feedback": "",
        "difficulty": 2,
        "mistakes": 0,
        "hints": 0,
        "successes": 0,
        "player_name": "",
        "maze_pos": [0, 0],
        "bomb_sequence": [],
        "bomb_phase": "show",
        "bomb_show_until": 0,
        "bomb_deadline": 0,
        "bomb_input": [],
        "colors": COLORS[:],
        "wire_target": [],
        "grid_pos": [0, 0],
        "logic_question": "",
        "logic_answer": 0,
        "circuit": [],
    }

    enter_stage(game, 1)
    return game


def update_bomb(game):
    if game["stage"] != 2 or game["status"] == "won":
        return

    now = time.time()

    if game["bomb_phase"] == "show" and now >= game["bomb_show_until"]:
        game["bomb_phase"] = "input"
        game["bomb_deadline"] = now + 35
        game["feedback"] = "Introdu toate formele în ordinea corectă."

    elif game["bomb_phase"] == "input" and now >= game["bomb_deadline"]:
        game["mistakes"] += 1
        game["bomb_input"] = []
        game["bomb_phase"] = "show"
        game["bomb_show_until"] = now + 5
        game["bomb_deadline"] = 0
        game["feedback"] = "Timpul a expirat. Încearcă din nou."


def move_player(game, key, walls, size, direction):
    delta = {
        "up": (-1, 0),
        "down": (1, 0),
        "left": (0, -1),
        "right": (0, 1),
    }

    if direction not in delta:
        return

    row, col = game[key]
    dr, dc = delta[direction]
    nr, nc = row + dr, col + dc
    blocked = [wall[:] for wall in walls]

    if key == "grid_pos" and game["difficulty"] >= 2:
        blocked.append([3, 3])

    if (
        not (0 <= nr < size and 0 <= nc < size)
        or [nr, nc] in blocked
    ):
        game["mistakes"] += 1
        game["feedback"] = "Drum blocat! Încearcă altă direcție."
        return

    game[key] = [nr, nc]

    if [nr, nc] == [size - 1, size - 1]:
        game["feedback"] = "Ai găsit ieșirea!"
        advance_stage(game)


def public_state(game):
    update_bomb(game)

    return {
        "stage": game["stage"],
        "stage_name": game["stage_name"],
        "status": game["status"],
        "feedback": game["feedback"],
        "difficulty": game["difficulty"],
        "difficulty_name": DIFFICULTY_NAMES[game["difficulty"]],
        "mistakes": game["mistakes"],
        "hints": game["hints"],
        "successes": game["successes"],
        "maze_walls": MAZE_WALLS,
        "maze_pos": game["maze_pos"],
        "symbols": SYMBOLS,
        "bomb_sequence": (
            game["bomb_sequence"]
            if game["bomb_phase"] == "show"
            else []
        ),
        "bomb_phase": game["bomb_phase"],
        "bomb_show_until": game["bomb_show_until"],
        "bomb_deadline": game["bomb_deadline"],
        "bomb_input": game["bomb_input"],
        "colors": game["colors"],
        "wire_target": game["wire_target"],
        "grid_walls": GRID_WALLS,
        "grid_pos": game["grid_pos"],
        "logic_question": game["logic_question"],
        "circuit": game["circuit"],
    }


def handle_action(game, action):
    kind = action.get("type", "")

    if kind == "tick":
        update_bomb(game)
        return public_state(game)

    if kind == "hint":
        game["hints"] += 1
        hints = {
            1: "Folosește săgețile pentru a evita pereții.",
            2: "Memorează formele de la stânga la dreapta.",
            3: "Așază capetele cablurilor în ordine.",
            4: "Ieșirea este în colțul din dreapta jos.",
            5: "Caută regula matematică a șirului.",
            6: "Rotește piesele pentru a conecta sursa la ieșire.",
        }
        game["feedback"] = hints.get(game["stage"], "")
        return public_state(game)

    if game["status"] == "won":
        return public_state(game)

    if kind == "maze_move" and game["stage"] == 1:
        move_player(game, "maze_pos", MAZE_WALLS, MAZE_SIZE,
                    action.get("direction", ""))

    elif kind == "grid_move" and game["stage"] == 4:
        move_player(game, "grid_pos", GRID_WALLS, GRID_SIZE,
                    action.get("direction", ""))

    elif kind == "bomb_pick" and game["stage"] == 2:
        update_bomb(game)
        symbol = action.get("symbol")

        if game["bomb_phase"] == "input" and symbol in SYMBOLS:
            idx = len(game["bomb_input"])

            if (
                idx < len(game["bomb_sequence"])
                and symbol == game["bomb_sequence"][idx]
            ):
                game["bomb_input"].append(symbol)

                if len(game["bomb_input"]) == len(game["bomb_sequence"]):
                    game["feedback"] = "Bomba a fost dezactivată!"
                    advance_stage(game)
            else:
                game["mistakes"] += 1
                game["bomb_input"] = []
                game["bomb_phase"] = "show"
                game["bomb_show_until"] = time.time() + 5
                game["bomb_deadline"] = 0
                game["feedback"] = "Formă greșită! Memorează din nou."

    elif kind == "wire_solved" and game["stage"] == 3:
        game["feedback"] = "Ai descurcat cablurile!"
        advance_stage(game)

    elif kind == "logic_submit" and game["stage"] == 5:
        try:
            answer = int(action.get("answer"))
        except (TypeError, ValueError):
            answer = None

        if answer == game["logic_answer"]:
            game["feedback"] = "Răspuns corect!"
            advance_stage(game)
        else:
            game["mistakes"] += 1
            game["feedback"] = "Răspuns greșit. Mai încearcă."

    elif kind == "circuit_rotate" and game["stage"] == 6:
        try:
            idx = int(action.get("index", -1))
        except (TypeError, ValueError):
            idx = -1

        if 0 <= idx < len(game["circuit"]):
            game["circuit"][idx]["rotation"] = (
                game["circuit"][idx]["rotation"] + 1
            ) % 4

            if circuit_is_connected(game["circuit"]):
                game["feedback"] = "Circuit conectat! Ai alimentat capsula."
                advance_stage(game)
            else:
                game["feedback"] = "Circuitul nu este încă legat până la ieșire."

    update_bomb(game)
    return public_state(game)
