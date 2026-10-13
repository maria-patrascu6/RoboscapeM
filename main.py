
import random
import time
import uuid
from collections import deque

from ml_model import predict_difficulty

MAZE_SIZE = 7
GRID_SIZE = 5

SYMBOLS = ["▲", "●", "■", "◆", "★"]
COLORS = ["Albastru", "Galben", "Mov", "Verde", "Roșu"]

MAZE_WALLS = [
    [0, 2], [0, 3], [0, 5], [1, 1], [1, 3], [1, 5],
    [2, 1], [2, 2], [2, 5], [3, 3], [3, 4], [3, 5],
    [4, 1], [4, 3], [5, 1], [5, 5], [6, 2], [6, 3], [6, 5],
]

GRID_WALLS = [
    [0, 2], [1, 0], [1, 2], [1, 4], [3, 1], [3, 2],
]

LOGIC_QUESTIONS = [
    {"question": "Completează șirul: 2, 4, 8, 16, ?", "answer": 32},
    {"question": "Completează șirul: 3, 6, 9, 12, ?", "answer": 15},
    {"question": "Completează șirul: 1, 4, 9, 16, ?", "answer": 25},
    {"question": "Completează șirul: 5, 10, 15, 20, ?", "answer": 25},
    {"question": "Completează șirul: 1, 2, 4, 8, ?", "answer": 16},
]

DIFFICULTY_NAMES = {
    1: "Ușor",
    2: "Mediu",
    3: "Dificil",
}


def update_difficulty(game):
    elapsed = max(0, int(time.time() - game["started_at"]))

    game["difficulty"] = predict_difficulty(
        game["mistakes"],
        game["hints"],
        game["successes"],
        stage=game["stage"],
        elapsed_seconds=elapsed,
        current_difficulty=game["difficulty"],
    )


def enter_stage(game, stage):
    game["stage"] = stage
    game["feedback"] = ""

    if stage == 1:
        game["stage_name"] = "Labirintul navei"
        game["maze_pos"] = [0, 0]

    elif stage == 2:
        game["stage_name"] = "Dezactivarea bombei"

        count = {1: 2, 2: 3, 3: 5}[game["difficulty"]]
        game["bomb_sequence"] = [
            random.choice(SYMBOLS) for _ in range(count)
        ]
        game["bomb_phase"] = "show"
        game["bomb_show_until"] = time.time() + 3
        game["bomb_deadline"] = 0
        game["bomb_input"] = []

    elif stage == 3:
        game["stage_name"] = "Panoul de cabluri"

        count = 5 if game["difficulty"] == 3 else 4
        game["colors"] = COLORS[:count]
        game["wire_target"] = random.sample(range(count), count)

        while game["wire_target"] == list(range(count)):
            game["wire_target"] = random.sample(range(count), count)

        game["wire_input"] = []

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
        game["feedback"] = "Felicitări! Ai terminat RoboScape."


def advance_stage(game):
    game["successes"] += 1
    update_difficulty(game)
    enter_stage(game, game["stage"] + 1)


def new_game():
    game = {
        "session_id": str(uuid.uuid4()),
        "started_at": time.time(),
        "_session_logged": False,
        "stage": 1,
        "stage_name": "Labirintul navei",
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
        "wire_input": [],
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

    if (
        game["bomb_phase"] == "show"
        and now >= game["bomb_show_until"]
    ):
        game["bomb_phase"] = "input"
        game["bomb_deadline"] = now + 20
        game["feedback"] = "Introdu simbolurile în ordinea memorată."

    elif (
        game["bomb_phase"] == "input"
        and now >= game["bomb_deadline"]
    ):
        game["mistakes"] += 1
        game["bomb_input"] = []
        game["bomb_phase"] = "show"
        game["bomb_show_until"] = now + 3
        game["bomb_deadline"] = 0
        game["feedback"] = "Timpul a expirat. Memorează din nou."


def move_player(game, key, walls, size, direction):
    row, col = game[key]

    delta = {
        "up": (-1, 0),
        "down": (1, 0),
        "left": (0, -1),
        "right": (0, 1),
    }

    if direction not in delta:
        return

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


def get_ports(tile):
    rotation = tile["rotation"] % 4

    if tile["kind"] == "straight":
        return {"N", "S"} if rotation % 2 == 0 else {"E", "W"}

    return [
        {"N", "E"},
        {"E", "S"},
        {"S", "W"},
        {"W", "N"},
    ][rotation]


def create_circuit(game):
    # Creează 16 piese cu orientări aleatorii.
    tiles = []

    for _ in range(16):
        kind = random.choice(["straight", "elbow"])
        rotation = random.randint(0, 3)
        tiles.append({"kind": kind, "rotation": rotation})

    game["circuit"] = tiles


def circuit_is_connected(tiles):
    directions = {
        "N": (-1, 0, "S"),
        "E": (0, 1, "W"),
        "S": (1, 0, "N"),
        "W": (0, -1, "E"),
    }

    if len(tiles) != 16:
        return False

    # Sursa se află în stânga sus, iar ieșirea în dreapta jos.
    queue = deque([(0, 0)])
    seen = {(0, 0)}

    while queue:
        r, c = queue.popleft()
        ports = get_ports(tiles[r * 4 + c])

        if (r, c) == (3, 3) and "E" in ports:
            return True

        for port in ports:
            dr, dc, opposite = directions[port]
            nr, nc = r + dr, c + dc

            if not (0 <= nr < 4 and 0 <= nc < 4):
                continue

            if opposite in get_ports(tiles[nr * 4 + nc]):
                if (nr, nc) not in seen:
                    seen.add((nr, nc))
                    queue.append((nr, nc))

    return False


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
        "wire_input": game["wire_input"],
        "grid_walls": GRID_WALLS,
        "grid_pos": game["grid_pos"],
        "logic_question": game["logic_question"],
        "circuit": game["circuit"],
    }


def handle_action(game, action):
    kind = action.get("type", "")

    if kind == "restart":
        player_name = game.get("player_name", "")
        game.clear()
        game.update(new_game())
        game["player_name"] = player_name
        return public_state(game)

    if kind == "tick":
        update_bomb(game)
        return public_state(game)

    if kind == "hint":
        game["hints"] += 1

        hints = {
            1: "Folosește săgețile pentru a evita pereții.",
            2: "Memorează simbolurile de la stânga la dreapta.",
            3: "Trage capetele cablurilor pentru a le descurca.",
            4: "Ajungi la ieșirea din colțul din dreapta jos.",
            5: "Observă regula matematică din șir.",
            6: "Rotește piesele pentru a conecta sursa cu ieșirea.",
        }

        game["feedback"] = hints.get(
            game["stage"], "Misiune finalizată!"
        )
        return public_state(game)

    if game["status"] == "won":
        return public_state(game)

    if kind == "maze_move" and game["stage"] == 1:
        move_player(
            game,
            "maze_pos",
            MAZE_WALLS,
            MAZE_SIZE,
            action.get("direction", ""),
        )

    elif kind == "grid_move" and game["stage"] == 4:
        move_player(
            game,
            "grid_pos",
            GRID_WALLS,
            GRID_SIZE,
            action.get("direction", ""),
        )

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
                game["bomb_show_until"] = time.time() + 3
                game["bomb_deadline"] = 0
                game["feedback"] = "Simbol greșit! Memorează din nou."

    elif kind == "wire_solved" and game["stage"] == 3:
        game["feedback"] = "Ai descurcat toate cablurile!"
        advance_stage(game)

    elif kind == "logic_submit" and game["stage"] == 5:
        try:
            answer = int(action.get("answer"))
        except (TypeError, ValueError):
            answer = None

        if answer == game["logic_answer"]:
            game["feedback"] = "Răspuns corect! Terminal deblocat."
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
            tile = game["circuit"][idx]
            tile["rotation"] = (tile["rotation"] + 1) % 4

            if circuit_is_connected(game["circuit"]):
                game["feedback"] = (
                    "Circuit conectat! Capsula este alimentată."
                )
                advance_stage(game)
            else:
                game["feedback"] = (
                    "Continuă să conectezi circuitul."
                )

    update_bomb(game)
    return public_state(game)
