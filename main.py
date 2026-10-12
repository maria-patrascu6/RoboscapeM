import random
import time
from collections import deque

from ml_model import predict_difficulty


# =========================================================
# CONFIGURARE GENERALA
# =========================================================

MAZE_SIZE = 7
SECURITY_SIZE = 5
CIRCUIT_SIZE = 4

MAZE_WALLS = {
    (1, 2), (1, 3), (2, 3),
    (3, 1), (3, 2),
    (4, 4), (4, 5), (5, 2)
}

BOMB_SYMBOLS = ["▲", "●", "■", "◆", "★", "✚"]
WIRE_COLORS = ["roșu", "albastru", "verde", "galben"]

LOGIC_QUESTIONS = [
    {
        "question": "Completează șirul: 2, 4, 8, 16, ?",
        "options": ["18", "24", "32", "30"],
        "answer": "32"
    },
    {
        "question": "Completează șirul: 3, 6, 9, 12, ?",
        "options": ["14", "15", "18", "21"],
        "answer": "15"
    },
    {
        "question": "Completează șirul: 1, 4, 9, 16, ?",
        "options": ["20", "24", "25", "36"],
        "answer": "25"
    },
    {
        "question": "Dacă toate A sunt B și toate B sunt C, atunci...",
        "options": [
            "Toate A sunt C",
            "Niciun A nu este C",
            "Toate C sunt A",
            "Nu se poate determina"
        ],
        "answer": "Toate A sunt C"
    }
]


# =========================================================
# LABIRINT
# =========================================================

def create_maze():
    maze = []

    for row in range(MAZE_SIZE):
        maze_row = []

        for col in range(MAZE_SIZE):
            if (row, col) in MAZE_WALLS:
                maze_row.append(1)
            else:
                maze_row.append(0)

        maze.append(maze_row)

    maze[0][0] = 0
    maze[MAZE_SIZE - 1][MAZE_SIZE - 1] = 0

    return maze


def maze_can_move(maze, row, col):
    if row < 0 or row >= MAZE_SIZE:
        return False

    if col < 0 or col >= MAZE_SIZE:
        return False

    return maze[row][col] == 0


# =========================================================
# CIRCUIT ELECTRIC
# =========================================================

# Rotatiile sunt in sens orar.
#
# straight:
#   rotatia 0 = N-S
#   rotatia 1 = E-W
#
# elbow:
#   rotatia 0 = N-E
#   rotatia 1 = E-S
#   rotatia 2 = S-W
#   rotatia 3 = W-N

def circuit_ports(tile):
    tile_type = tile["type"]
    rotation = tile["rotation"] % 4

    if tile_type == "straight":
        if rotation % 2 == 0:
            return {"N", "S"}

        return {"E", "W"}

    if tile_type == "elbow":
        port_options = [
            {"N", "E"},
            {"E", "S"},
            {"S", "W"},
            {"W", "N"}
        ]

        return port_options[rotation]

    if tile_type == "cross":
        return {"N", "E", "S", "W"}

    return set()


def circuit_solution():
    # Traseul corect:
    # intrare W -> (0,0) -> (0,1) -> (0,2)
    # -> (1,2) -> (2,2) -> (2,3)
    # -> (3,3) -> iesire E

    solution = [
        ("straight", 1), ("straight", 1),
        ("elbow", 1),    ("elbow", 2),

        ("elbow", 0),    ("straight", 0),
        ("straight", 0), ("straight", 0),

        ("straight", 0), ("straight", 0),
        ("elbow", 0),    ("elbow", 2),

        ("straight", 0), ("elbow", 1),
        ("straight", 0), ("elbow", 0)
    ]

    # Pozitiile traseului sunt corectate mai jos pentru a
    # asigura o conexiune continua intre intrare si iesire.
    solution[0] = ("straight", 1)   # W-E
    solution[1] = ("straight", 1)   # W-E
    solution[2] = ("elbow", 2)      # S-W
    solution[6] = ("straight", 0)   # N-S
    solution[10] = ("elbow", 3)     # W-N
    solution[11] = ("elbow", 1)     # E-S
    solution[15] = ("elbow", 3)     # W-N

    return solution


def create_circuit(game):
    solution = circuit_solution()
    tiles = []

    for index, (correct_type, correct_rotation) in enumerate(solution):
        tile_type = correct_type
        rotation = correct_rotation

        # Pozitiile 0, 1, 2, 6, 10, 11 si 15 fac parte
        # din traseul solutiei. Unele piese sunt rotite gresit.
        if index in (0, 1, 2, 6, 10, 11, 15):
            rotation = (correct_rotation + random.choice([1, 2, 3])) % 4

        # Piesele din afara traseului sunt capcane.
        elif random.random() < 0.5:
            rotation = random.randint(0, 3)

        tiles.append({
            "type": tile_type,
            "rotation": rotation,
            "index": index
        })

    game["circuit_tiles"] = tiles
    game["circuit_solution"] = [
        {"type": tile_type, "rotation": rotation}
        for tile_type, rotation in solution
    ]


def circuit_is_connected(tiles):
    if len(tiles) != CIRCUIT_SIZE * CIRCUIT_SIZE:
        return False

    directions = {
        "N": (-1, 0, "S"),
        "E": (0, 1, "W"),
        "S": (1, 0, "N"),
        "W": (0, -1, "E")
    }

    start = (0, 0)
    target = (CIRCUIT_SIZE - 1, CIRCUIT_SIZE - 1)

    start_ports = circuit_ports(tiles[0])

    # Sursa trebuie conectata la intrarea W.
    if "W" not in start_ports:
        return False

    visited = {start}
    queue = deque([start])

    while queue:
        row, col = queue.popleft()
        index = row * CIRCUIT_SIZE + col
        current_ports = circuit_ports(tiles[index])

        # Iesirea capsulei este in partea E a ultimei piese.
        if (row, col) == target and "E" in current_ports:
            return True

        for port in current_ports:
            dr, dc, opposite = directions[port]
            next_row = row + dr
            next_col = col + dc

            if not (
                0 <= next_row < CIRCUIT_SIZE
                and 0 <= next_col < CIRCUIT_SIZE
            ):
                continue

            next_index = next_row * CIRCUIT_SIZE + next_col
            next_ports = circuit_ports(tiles[next_index])

            if opposite not in next_ports:
                continue

            next_position = (next_row, next_col)

            if next_position not in visited:
                visited.add(next_position)
                queue.append(next_position)

    return False


# =========================================================
# INITIALIZAREA JOCULUI
# =========================================================

def new_game():
    game = {
        "stage": 1,
        "stage_name": "Labirintul navei",
        "description": (
            "Ghideaza robotul prin labirint si ajungi la iesire."
        ),
        "difficulty": "normal",
        "message": "Misiunea a inceput. Succes!",
        "finished": False,

        "mistakes": 0,
        "hints": 0,
        "successes": 0,

        # Labirint
        "maze": create_maze(),
        "x": 0,
        "y": 0,

        # Bomba
        "bomb_sequence": [],
        "bomb_options": [],
        "bomb_phase": "show",
        "bomb_show_until": 0,
        "bomb_deadline": 0,
        "bomb_input": [],

        # Cabluri
        "wire_target": [],
        "wire_options": [],

        # Grila de securitate
        "security_grid": [],
        "security_x": 0,
        "security_y": 0,
        "security_target": (4, 4),

        # Puzzle logic
        "logic_question": "",
        "logic_options": [],
        "logic_answer": "",

        # Circuit final
        "circuit_tiles": [],
        "circuit_solution": [],

        # Model ML
        "ml_prediction": "normal"
    }

    enter_stage(game, 1)

    return game


# =========================================================
# DIFICULTATE ADAPTIVA
# =========================================================

def update_difficulty(game):
    try:
        prediction = predict_difficulty(
            game["mistakes"],
            game["hints"],
            game["successes"]
        )

        if isinstance(prediction, dict):
            prediction = prediction.get(
                "difficulty",
                prediction.get("prediction", "normal")
            )

        game["ml_prediction"] = str(prediction)

        text_prediction = str(prediction).lower()

        if "hard" in text_prediction or "greu" in text_prediction:
            game["difficulty"] = "greu"

        elif "easy" in text_prediction or "usor" in text_prediction:
            game["difficulty"] = "usor"

        else:
            game["difficulty"] = "normal"

    except Exception:
        # Jocul continua si daca modelul ML nu poate prezice.
        game["difficulty"] = "normal"
        game["ml_prediction"] = "normal"


# =========================================================
# TRECEREA INTRE ETAPE
# =========================================================

def enter_stage(game, stage):
    game["stage"] = stage
    game["message"] = ""

    if stage == 1:
        game["stage_name"] = "Labirintul navei"
        game["description"] = (
            "Deplaseaza robotul cu sagetile si ajungi la iesire."
        )

        game["maze"] = create_maze()
        game["x"] = 0
        game["y"] = 0

    elif stage == 2:
        game["stage_name"] = "Dezactivarea bombei"
        game["description"] = (
            "Memoreaza simbolurile si introdu-le in ordinea corecta."
        )

        count = 3

        if game["difficulty"] == "greu":
            count = 5
        elif game["difficulty"] == "usor":
            count = 2

        game["bomb_sequence"] = [
            random.choice(BOMB_SYMBOLS)
            for _ in range(count)
        ]

        game["bomb_options"] = BOMB_SYMBOLS[:]
        random.shuffle(game["bomb_options"])

        game["bomb_input"] = []
        game["bomb_phase"] = "show"
        game["bomb_show_until"] = time.time() + 3
        game["bomb_deadline"] = 0

    elif stage == 3:
        game["stage_name"] = "Panoul de cabluri"
        game["description"] = (
            "Selecteaza culorile in ordinea indicata de sistem."
        )

        game["wire_target"] = WIRE_COLORS[:]
        random.shuffle(game["wire_target"])

        game["wire_options"] = WIRE_COLORS[:]
        random.shuffle(game["wire_options"])

        game["wire_input"] = []

    elif stage == 4:
        game["stage_name"] = "Grila de securitate"
        game["description"] = (
            "Deplaseaza robotul pana la punctul de acces."
        )

        game["security_grid"] = [
            [0, 0, 1, 0, 0],
            [1, 0, 1, 0, 1],
            [0, 0, 0, 0, 0],
            [0, 1, 1, 0, 1],
            [0, 0, 0, 0, 0]
        ]

        game["security_x"] = 0
        game["security_y"] = 0
        game["security_target"] = (4, 4)

    elif stage == 5:
        game["stage_name"] = "Terminalul logic"
        game["description"] = (
            "Rezolva problema logica pentru a debloca reactorul."
        )

        question = random.choice(LOGIC_QUESTIONS)

        game["logic_question"] = question["question"]
        game["logic_options"] = question["options"][:]
        game["logic_answer"] = question["answer"]

    elif stage == 6:
        game["stage_name"] = "Circuitul de evacuare"
        game["description"] = (
            "Rotește piesele pentru a conecta sursa de energie "
            "la capsula de evacuare."
        )

        create_circuit(game)

    else:
        game["stage"] = 7
        game["stage_name"] = "Misiune finalizata"
        game["description"] = (
            "Robotul a reusit sa activeze capsula de evacuare."
        )
        game["finished"] = True
        game["message"] = "Felicitari! Ai terminat RoboScape."


def advance_stage(game):
    game["successes"] += 1
    update_difficulty(game)

    next_stage = game["stage"] + 1
    enter_stage(game, next_stage)


# =========================================================
# MISCARE
# =========================================================

def get_direction(action):
    direction = action.get("direction", "")

    if direction in ("up", "down", "left", "right"):
        return direction

    key = action.get("key", "")

    key_map = {
        "ArrowUp": "up",
        "ArrowDown": "down",
        "ArrowLeft": "left",
        "ArrowRight": "right",
        "w": "up",
        "s": "down",
        "a": "left",
        "d": "right"
    }

    return key_map.get(key, "")


def move_robot(game, direction):
    dx = 0
    dy = 0

    if direction == "up":
        dy = -1
    elif direction == "down":
        dy = 1
    elif direction == "left":
        dx = -1
    elif direction == "right":
        dx = 1
    else:
        return

    # Etapa 1: labirint
    if game["stage"] == 1:
        new_x = game["x"] + dx
        new_y = game["y"] + dy

        if maze_can_move(game["maze"], new_y, new_x):
            game["x"] = new_x
            game["y"] = new_y
        else:
            game["mistakes"] += 1
            game["message"] = "Ai intalnit un perete."

        if game["x"] == MAZE_SIZE - 1 and game["y"] == MAZE_SIZE - 1:
            game["message"] = "Ai gasit iesirea!"
            advance_stage(game)

    # Etapa 4: grila de securitate
    elif game["stage"] == 4:
        new_x = game["security_x"] + dx
        new_y = game["security_y"] + dy

        grid = game["security_grid"]

        if (
            0 <= new_x < SECURITY_SIZE
            and 0 <= new_y < SECURITY_SIZE
            and grid[new_y][new_x] == 0
        ):
            game["security_x"] = new_x
            game["security_y"] = new_y
        else:
            game["mistakes"] += 1
            game["message"] = "Acces blocat. Incearca alt traseu."

        if (new_x, new_y) == game["security_target"]:
            game["message"] = "Ai trecut de grila de securitate!"
            advance_stage(game)


# =========================================================
# BOMBA
# =========================================================

def update_bomb_timer(game):
    if game["stage"] != 2:
        return

    now = time.time()

    if (
        game["bomb_phase"] == "show"
        and now >= game["bomb_show_until"]
    ):
        game["bomb_phase"] = "input"
        game["bomb_deadline"] = now + 20
        game["message"] = "Introdu simbolurile memorate."

    if (
        game["bomb_phase"] == "input"
        and game["bomb_deadline"] > 0
        and now >= game["bomb_deadline"]
    ):
        game["mistakes"] += 1
        game["bomb_input"] = []
        game["bomb_phase"] = "show"
        game["bomb_show_until"] = now + 3
        game["bomb_deadline"] = 0
        game["message"] = "Timpul a expirat. Memoreaza din nou."


def bomb_guess(game, symbol):
    update_bomb_timer(game)

    if game["stage"] != 2 or game["bomb_phase"] != "input":
        return

    if symbol not in game["bomb_options"]:
        return

    index = len(game["bomb_input"])

    if index >= len(game["bomb_sequence"]):
        return

    game["bomb_input"].append(symbol)

    if symbol != game["bomb_sequence"][index]:
        game["mistakes"] += 1
        game["bomb_input"] = []
        game["bomb_phase"] = "show"
        game["bomb_show_until"] = time.time() + 3
        game["bomb_deadline"] = 0
        game["message"] = "Secventa incorecta. Mai incearca."
        return

    if len(game["bomb_input"]) == len(game["bomb_sequence"]):
        game["message"] = "Bomba a fost dezactivata!"
        advance_stage(game)


def hide_bomb(game):
    if game["stage"] != 2:
        return

    if (
        game["bomb_phase"] == "show"
        and time.time() >= game["bomb_show_until"]
    ):
        game["bomb_phase"] = "input"
        game["bomb_deadline"] = time.time() + 20
        game["message"] = "Introdu simbolurile memorate."


# =========================================================
# CABLURI
# =========================================================

def select_wire(game, color):
    if game["stage"] != 3:
        return

    if color not in game["wire_options"]:
        return

    selected = game.setdefault("wire_input", [])

    if color in selected:
        return

    index = len(selected)

    if color != game["wire_target"][index]:
        game["mistakes"] += 1
        game["wire_input"] = []
        game["message"] = "Ordine gresita. Incearca din nou."
        return

    selected.append(color)

    if len(selected) == len(game["wire_target"]):
        game["message"] = "Toate cablurile sunt conectate corect!"
        advance_stage(game)


# =========================================================
# PUZZLE LOGIC
# =========================================================

def answer_logic(game, answer):
    if game["stage"] != 5:
        return

    answer = str(answer).strip()

    if answer == game["logic_answer"]:
        game["message"] = "Raspuns corect! Reactorul este deblocat."
        advance_stage(game)
    else:
        game["mistakes"] += 1
        game["message"] = "Raspuns incorect. Mai incearca."


# =========================================================
# CIRCUIT FINAL
# =========================================================

def rotate_circuit_tile(game, action):
    if game["stage"] != 6:
        return

    index = action.get("index")

    if index is None:
        row = action.get("row")
        col = action.get("col")

        if row is None or col is None:
            return

        index = int(row) * CIRCUIT_SIZE + int(col)

    try:
        index = int(index)
    except (ValueError, TypeError):
        return

    if not 0 <= index < len(game["circuit_tiles"]):
        return

    tile = game["circuit_tiles"][index]
    tile["rotation"] = (tile["rotation"] + 1) % 4

    game["message"] = "Piesa rotita. Verifica traseul energiei."


def check_circuit(game):
    if game["stage"] != 6:
        return

    if circuit_is_connected(game["circuit_tiles"]):
        game["message"] = "Circuit complet! Capsula este alimentata."
        advance_stage(game)
    else:
        game["mistakes"] += 1
        game["message"] = (
            "Circuitul nu este inca functional. "
            "Verifica legaturile dintre piese."
        )


# =========================================================
# INDICII
# =========================================================

def give_hint(game):
    game["hints"] += 1

    stage = game["stage"]

    if stage == 1:
        game["message"] = (
            "Incearca sa avansezi spre dreapta si in jos, "
            "evitand peretii."
        )

    elif stage == 2:
        game["message"] = (
            "Memoreaza simbolurile de la stanga la dreapta."
        )

    elif stage == 3:
        game["message"] = (
            "Respecta ordinea culorilor indicata de panou."
        )

    elif stage == 4:
        game["message"] = (
            "Cauta o cale libera pana in coltul din dreapta jos."
        )

    elif stage == 5:
        game["message"] = (
            "Identifica regula care se repeta in sirul logic."
        )

    elif stage == 6:
        game["message"] = (
            "Roteste piesele astfel incat porturile vecine "
            "sa se potriveasca."
        )

    else:
        game["message"] = "Misiunea este deja finalizata."


# =========================================================
# STAREA TRIMISA CATRE INTERFATA
# =========================================================

def public_state(game):
    update_bomb_timer(game)

    tiles = []

    for tile in game.get("circuit_tiles", []):
        tiles.append({
            "type": tile["type"],
            "rotation": tile["rotation"],
            "index": tile["index"]
        })

    bomb_remaining = 0

    if game["stage"] == 2 and game["bomb_phase"] == "input":
        bomb_remaining = max(
            0,
            int(game["bomb_deadline"] - time.time())
        )

    return {
        "stage": game["stage"],
        "stage_name": game["stage_name"],
        "description": game["description"],
        "difficulty": game["difficulty"],
        "message": game["message"],
        "finished": game["finished"],

        "mistakes": game["mistakes"],
        "hints": game["hints"],
        "successes": game["successes"],

        # Labirint
        "maze": game["maze"],
        "x": game["x"],
        "y": game["y"],

        # Bomba
        "bomb_sequence": (
            game["bomb_sequence"]
            if game["bomb_phase"] == "show"
            else []
        ),
        "bomb_options": game["bomb_options"],
        "bomb_phase": game["bomb_phase"],
        "bomb_show_until": game["bomb_show_until"],
        "bomb_deadline": game["bomb_deadline"],
        "bomb_remaining": bomb_remaining,
        "bomb_input": game["bomb_input"],

        # Cabluri
        "wire_target": game["wire_target"],
        "wire_options": game["wire_options"],
        "wire_input": game.get("wire_input", []),

        # Grila de securitate
        "security_grid": game["security_grid"],
        "security_x": game["security_x"],
        "security_y": game["security_y"],
        "security_target": list(game["security_target"]),

        # Logica
        "logic_question": game["logic_question"],
        "logic_options": game["logic_options"],

        # Circuit
        "circuit_tiles": tiles,

        # ML
        "ml_prediction": game["ml_prediction"]
    }


# =========================================================
# GESTIONAREA ACTIUNILOR DIN BROWSER
# =========================================================

def handle_action(game, action):
    action_type = action.get("type", "")

    if game["finished"]:
        if action_type == "restart":
            return public_state(new_game())

        return public_state(game)

    # Actualizeaza timerul bombei cand este necesar.
    update_bomb_timer(game)

    if action_type in ("move", "move_robot"):
        direction = get_direction(action)
        move_robot(game, direction)

    elif action_type in ("bomb_guess", "select_symbol"):
        symbol = action.get("symbol", action.get("value", ""))
        bomb_guess(game, symbol)

    elif action_type == "hide_bomb":
        hide_bomb(game)

    elif action_type in ("wire_pick", "select_wire"):
        color = action.get("color", action.get("value", ""))
        select_wire(game, color)

    elif action_type in ("logic_answer", "answer"):
        answer = action.get("answer", action.get("value", ""))
        answer_logic(game, answer)

    elif action_type in ("rotate_tile", "rotate_circuit"):
        rotate_circuit_tile(game, action)

    elif action_type in ("check_circuit", "submit_circuit"):
        check_circuit(game)

    elif action_type == "hint":
        give_hint(game)

    elif action_type == "restart":
        game = new_game()

    elif action_type == "tick":
        # Actualizarea timerului se face deja mai sus.
        pass

    return public_state(game)
