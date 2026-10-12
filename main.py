
import random
import time
from collections import deque

from ml_model import predict_difficulty


# =========================================================
# CONSTANTE
# =========================================================

MAZE_SIZE = 7
GRID_SIZE = 5
CIRCUIT_SIZE = 4

# Peretii labirintului: [rand, coloana]
MAZE_WALLS = [
    [0, 2], [0, 3], [0, 5],
    [1, 1], [1, 3], [1, 5],
    [2, 1], [2, 2], [2, 5],
    [3, 3], [3, 4], [3, 5],
    [4, 1], [4, 3],
    [5, 1], [5, 5],
    [6, 2], [6, 3], [6, 5]
]

# Peretii grilei de securitate.
# Am lasat libera coloana din dreapta jos pentru a permite
# accesul la iesire, inclusiv la dificultatea medie si maxima.
GRID_WALLS = [
    [0, 2],
    [1, 0], [1, 2], [1, 4],
    [3, 1], [3, 2]
]

SYMBOLS = ["▲", "●", "■", "◆", "★"]

COLORS = ["Albastru", "Galben", "Mov", "Verde", "Roșu"]

DIFFICULTY_NAMES = {
    1: "usor",
    2: "mediu",
    3: "dificil"
}


# =========================================================
# LABIRINT
# =========================================================

def create_maze():
    maze = []

    for row in range(MAZE_SIZE):
        current_row = []

        for col in range(MAZE_SIZE):
            if [row, col] in MAZE_WALLS:
                current_row.append(1)
            else:
                current_row.append(0)

        maze.append(current_row)

    maze[0][0] = 0
    maze[6][6] = 0

    return maze


def can_move_maze(row, col):
    if row < 0 or row >= MAZE_SIZE:
        return False

    if col < 0 or col >= MAZE_SIZE:
        return False

    return [row, col] not in MAZE_WALLS


def move_maze(game, direction):
    row = game["maze_pos"][0]
    col = game["maze_pos"][1]

    new_row = row
    new_col = col

    if direction == "up":
        new_row -= 1
    elif direction == "down":
        new_row += 1
    elif direction == "left":
        new_col -= 1
    elif direction == "right":
        new_col += 1
    else:
        return

    if can_move_maze(new_row, new_col):
        game["maze_pos"] = [new_row, new_col]
        game["feedback"] = ""
    else:
        game["mistakes"] += 1
        game["feedback"] = "Ai intalnit un perete!"

    if game["maze_pos"] == [6, 6]:
        game["feedback"] = "Ai gasit iesirea!"
        advance_stage(game)


# =========================================================
# GRILA DE SECURITATE
# =========================================================

def can_move_grid(row, col, game):
    if row < 0 or row >= GRID_SIZE:
        return False

    if col < 0 or col >= GRID_SIZE:
        return False

    walls = [wall[:] for wall in GRID_WALLS]

    # La dificultatea medie sau maxima apare un obstacol
    # suplimentar, fara sa blocheze complet drumul spre iesire.
    if game["difficulty"] >= 2:
        walls.append([3, 3])

    return [row, col] not in walls


def move_grid(game, direction):
    row = game["grid_pos"][0]
    col = game["grid_pos"][1]

    new_row = row
    new_col = col

    if direction == "up":
        new_row -= 1
    elif direction == "down":
        new_row += 1
    elif direction == "left":
        new_col -= 1
    elif direction == "right":
        new_col += 1
    else:
        return

    if can_move_grid(new_row, new_col, game):
        game["grid_pos"] = [new_row, new_col]
        game["feedback"] = ""
    else:
        game["mistakes"] += 1
        game["feedback"] = "Drum blocat! Incearca alta directie."

    if game["grid_pos"] == [4, 4]:
        game["feedback"] = "Ai trecut de grila de securitate!"
        advance_stage(game)


# =========================================================
# DIFICULTATE ADAPTIVA CU MACHINE LEARNING
# =========================================================

def update_difficulty(game):
    try:
        result = predict_difficulty(
            game["mistakes"],
            game["hints"],
            game["successes"]
        )

        result = int(result)

        if result < 1:
            result = 1

        if result > 3:
            result = 3

        game["difficulty"] = result

    except Exception:
        game["difficulty"] = 2


# =========================================================
# BOMBA - MEMORAREA SIMBOLURILOR
# =========================================================

def setup_bomb(game):
    count = 3

    if game["difficulty"] == 1:
        count = 2
    elif game["difficulty"] == 3:
        count = 5

    game["bomb_sequence"] = [
        random.choice(SYMBOLS)
        for _ in range(count)
    ]

    game["bomb_phase"] = "show"
    game["bomb_show_until"] = time.time() + 3
    game["bomb_deadline"] = 0
    game["bomb_input"] = []


def update_bomb(game):
    if game["stage"] != 2:
        return

    now = time.time()

    if (
        game["bomb_phase"] == "show"
        and now >= game["bomb_show_until"]
    ):
        game["bomb_phase"] = "input"
        game["bomb_deadline"] = now + 20
        game["feedback"] = (
            "Introdu simbolurile in ordinea memorata."
        )

    elif (
        game["bomb_phase"] == "input"
        and now >= game["bomb_deadline"]
    ):
        game["mistakes"] += 1
        game["bomb_input"] = []
        game["bomb_phase"] = "show"
        game["bomb_show_until"] = now + 3
        game["bomb_deadline"] = 0
        game["feedback"] = (
            "Timpul a expirat. Memoreaza din nou."
        )


def pick_bomb_symbol(game, symbol):
    update_bomb(game)

    if game["stage"] != 2:
        return

    if game["bomb_phase"] != "input":
        return

    if symbol not in SYMBOLS:
        return

    position = len(game["bomb_input"])

    if position >= len(game["bomb_sequence"]):
        return

    if symbol != game["bomb_sequence"][position]:
        game["mistakes"] += 1
        game["bomb_input"] = []
        game["bomb_phase"] = "show"
        game["bomb_show_until"] = time.time() + 3
        game["bomb_deadline"] = 0
        game["feedback"] = (
            "Simbol gresit! Incearca din nou."
        )
        return

    game["bomb_input"].append(symbol)

    if len(game["bomb_input"]) == len(game["bomb_sequence"]):
        game["feedback"] = "Bomba a fost dezactivata!"
        advance_stage(game)


def hide_bomb(game):
    if game["stage"] != 2:
        return

    if game["bomb_phase"] == "show":
        if time.time() >= game["bomb_show_until"]:
            game["bomb_phase"] = "input"
            game["bomb_deadline"] = time.time() + 20
            game["feedback"] = (
                "Introdu simbolurile memorate."
            )


# =========================================================
# CABLURI
# =========================================================

def setup_wires(game):
    count = 4

    if game["difficulty"] == 3:
        count = 5

    game["colors"] = COLORS[:]

    game["wire_target"] = random.sample(
        list(range(len(COLORS))),
        count
    )

    game["wire_input"] = []


def pick_wire(game, color_index):
    if game["stage"] != 3:
        return

    try:
        color_index = int(color_index)
    except (TypeError, ValueError):
        return

    if color_index < 0 or color_index >= len(game["colors"]):
        return

    if color_index in game["wire_input"]:
        return

    position = len(game["wire_input"])

    if position >= len(game["wire_target"]):
        return

    if color_index != game["wire_target"][position]:
        game["mistakes"] += 1
        game["wire_input"] = []
        game["feedback"] = (
            "Ordine gresita! Incearca din nou."
        )
        return

    game["wire_input"].append(color_index)

    if len(game["wire_input"]) == len(game["wire_target"]):
        game["feedback"] = (
            "Cablurile au fost conectate corect!"
        )
        advance_stage(game)


# =========================================================
# PUZZLE LOGIC
# =========================================================

LOGIC_QUESTIONS = [
    {
        "question": "Completeaza sirul: 2, 4, 8, 16, ?",
        "answer": 32
    },
    {
        "question": "Completeaza sirul: 3, 6, 9, 12, ?",
        "answer": 15
    },
    {
        "question": "Completeaza sirul: 1, 4, 9, 16, ?",
        "answer": 25
    },
    {
        "question": "Completeaza sirul: 5, 10, 15, 20, ?",
        "answer": 25
    },
    {
        "question": "Completeaza sirul: 1, 2, 4, 8, ?",
        "answer": 16
    }
]


def setup_logic(game):
    question = random.choice(LOGIC_QUESTIONS)

    game["logic_question"] = question["question"]
    game["logic_answer"] = question["answer"]


def submit_logic(game, answer):
    if game["stage"] != 5:
        return

    try:
        answer = int(answer)
    except (TypeError, ValueError):
        game["feedback"] = "Introdu un raspuns numeric."
        return

    if answer == game["logic_answer"]:
        game["feedback"] = (
            "Raspuns corect! Terminalul a fost deblocat."
        )
        advance_stage(game)
    else:
        game["mistakes"] += 1
        game["feedback"] = "Raspuns gresit. Mai incearca."


# =========================================================
# CIRCUIT ELECTRIC
# =========================================================

def get_ports(tile):
    kind = tile["kind"]
    rotation = tile["rotation"] % 4

    if kind == "straight":
        if rotation % 2 == 0:
            return {"N", "S"}

        return {"E", "W"}

    if kind == "elbow":
        possibilities = [
            {"N", "E"},
            {"E", "S"},
            {"S", "W"},
            {"W", "N"}
        ]

        return possibilities[rotation]

    if kind == "cross":
        return {"N", "E", "S", "W"}

    return set()


def create_circuit(game):
    # Traseul corect:
    # 0 -> 1 -> 2 -> 6 -> 10 -> 11 -> 15
    #
    # Piesa 0: intrare din stanga, iesire spre dreapta.
    # Piesa 2: intrare din stanga, iesire in jos.
    # Piesa 10: intrare de sus, iesire spre stanga.
    # Piesa 11: intrare din stanga, iesire in jos.
    # Piesa 15: intrare de sus, iesire in jos.

    solution = {
        0: ("straight", 1),
        1: ("straight", 1),
        2: ("elbow", 1),
        6: ("straight", 0),
        10: ("elbow", 3),
        11: ("elbow", 2),
        15: ("straight", 0)
    }

    tiles = []

    for index in range(16):
        if index in solution:
            kind, correct_rotation = solution[index]

            if kind == "straight":
                # Schimba orientarea reala a piesei.
                rotation = (correct_rotation + 1) % 4
            else:
                # Pentru coturi, toate celelalte rotatii
                # reprezinta orientari diferite.
                rotation = (
                    correct_rotation + random.choice([1, 2, 3])
                ) % 4

        else:
            kind = random.choice(["straight", "elbow"])
            rotation = random.randint(0, 3)

        tiles.append({
            "kind": kind,
            "rotation": rotation
        })

    game["circuit"] = tiles


def circuit_is_connected(tiles):
    if len(tiles) != 16:
        return False

    start = (0, 0)
    target = (3, 3)

    # Sursa intra prin partea stanga a primei piese.
    if "W" not in get_ports(tiles[0]):
        return False

    directions = {
        "N": (-1, 0, "S"),
        "E": (0, 1, "W"),
        "S": (1, 0, "N"),
        "W": (0, -1, "E")
    }

    visited = {start}
    queue = deque([start])

    while queue:
        row, col = queue.popleft()
        index = row * CIRCUIT_SIZE + col
        ports = get_ports(tiles[index])

        # Capsula necesita o conexiune spre jos
        # la ultima piesa, din coltul dreapta-jos.
        if (row, col) == target and "S" in ports:
            return True

        for direction in ports:
            dr, dc, opposite = directions[direction]

            nr = row + dr
            nc = col + dc

            if not (
                0 <= nr < CIRCUIT_SIZE
                and 0 <= nc < CIRCUIT_SIZE
            ):
                continue

            next_index = nr * CIRCUIT_SIZE + nc

            if opposite not in get_ports(tiles[next_index]):
                continue

            position = (nr, nc)

            if position not in visited:
                visited.add(position)
                queue.append(position)

    return False


def rotate_circuit(game, index):
    if game["stage"] != 6:
        return

    try:
        index = int(index)
    except (TypeError, ValueError):
        return

    if index < 0 or index >= len(game["circuit"]):
        return

    tile = game["circuit"][index]
    tile["rotation"] = (tile["rotation"] + 1) % 4

    if circuit_is_connected(game["circuit"]):
        game["feedback"] = (
            "Circuit complet! Capsula este alimentata."
        )
        advance_stage(game)
    else:
        game["feedback"] = (
            "Piesa rotita. Continua sa conectezi circuitul."
        )


# =========================================================
# INDICII
# =========================================================

def give_hint(game):
    game["hints"] += 1

    hints = {
        1: "Foloseste sagetile pentru a evita peretii labirintului.",
        2: "Memoreaza simbolurile de la stanga la dreapta.",
        3: "Conecteaza culorile in ordinea afisata.",
        4: "Cauta un traseu liber pana la coltul din dreapta jos.",
        5: "Observa regula matematica din sirul numeric.",
        6: "Roteste piesele astfel incat porturile vecine sa se potriveasca."
    }

    game["feedback"] = hints.get(
        game["stage"],
        "Misiune finalizata!"
    )


# =========================================================
# INITIALIZAREA SI TRECEREA INTRE ETAPE
# =========================================================

def enter_stage(game, stage):
    game["stage"] = stage
    game["feedback"] = ""

    if stage == 1:
        game["stage_name"] = "Labirintul navei"
        game["maze_pos"] = [0, 0]

    elif stage == 2:
        game["stage_name"] = "Dezactivarea bombei"
        setup_bomb(game)

    elif stage == 3:
        game["stage_name"] = "Panoul de cabluri"
        setup_wires(game)

    elif stage == 4:
        game["stage_name"] = "Grila de securitate"
        game["grid_pos"] = [0, 0]

    elif stage == 5:
        game["stage_name"] = "Terminalul logic"
        setup_logic(game)

    elif stage == 6:
        game["stage_name"] = "Circuitul de evacuare"
        create_circuit(game)

    else:
        game["stage"] = 7
        game["stage_name"] = "Misiune finalizata"
        game["status"] = "won"
        game["feedback"] = (
            "Felicitari! Ai terminat RoboScape."
        )


def advance_stage(game):
    game["successes"] += 1

    update_difficulty(game)

    enter_stage(game, game["stage"] + 1)


def new_game():
    game = {
        "stage": 1,
        "stage_name": "Labirintul navei",
        "status": "playing",
        "feedback": "",

        "difficulty": 2,
        "mistakes": 0,
        "hints": 0,
        "successes": 0,

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

        "circuit": []
    }

    enter_stage(game, 1)

    return game


# =========================================================
# STAREA TRIMISA CATRE GAME.JS
# =========================================================

def public_state(game):
    update_bomb(game)

    return {
        "stage": game["stage"],
        "stage_name": game["stage_name"],
        "status": game["status"],
        "feedback": game["feedback"],

        "difficulty": game["difficulty"],
        "difficulty_name": DIFFICULTY_NAMES.get(
            game["difficulty"],
            "mediu"
        ),

        "mistakes": game["mistakes"],
        "hints": game["hints"],
        "successes": game["successes"],

        # Labirint
        "maze_walls": MAZE_WALLS,
        "maze_pos": game["maze_pos"],

        # Bomba
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

        # Cabluri
        "colors": game["colors"],
        "wire_target": game["wire_target"],
        "wire_input": game["wire_input"],

        # Grila de securitate
        "grid_walls": GRID_WALLS,
        "grid_pos": game["grid_pos"],

        # Puzzle logic
        "logic_question": game["logic_question"],

        # Circuit electric
        "circuit": game["circuit"]
    }


# =========================================================
# ACTIUNILE PRIMITE DE LA INTERFATA
# =========================================================

def handle_action(game, action):
    action_type = action.get("type", "")

    if action_type == "tick":
        update_bomb(game)
        return public_state(game)

    if action_type == "hint":
        give_hint(game)
        return public_state(game)

    if action_type == "restart":
        game.clear()
        game.update(new_game())
        return public_state(game)

    if game["status"] == "won":
        return public_state(game)

    if action_type == "maze_move":
        if game["stage"] == 1:
            move_maze(game, action.get("direction", ""))

    elif action_type == "grid_move":
        if game["stage"] == 4:
            move_grid(game, action.get("direction", ""))

    elif action_type == "hide_bomb":
        hide_bomb(game)

    elif action_type == "bomb_pick":
        pick_bomb_symbol(game, action.get("symbol", ""))

    elif action_type == "wire_pick":
        pick_wire(game, action.get("color"))

    elif action_type == "logic_submit":
        submit_logic(game, action.get("answer", ""))

    elif action_type == "circuit_rotate":
        rotate_circuit(game, action.get("index", -1))

    update_bomb(game)

    return public_state(game)
