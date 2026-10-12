
import random
import time
from ml_model import predict_difficulty

COLORS = ["Albastru", "Galben", "Mov", "Verde", "Rosu"]
SYMBOLS = ["▲", "◆", "●", "★"]

MAZE_WALLS = {
    (1, 2), (1, 3), (2, 3), (3, 1),
    (3, 2), (4, 4), (4, 5), (5, 2)
}

GRID_WALLS = {(1, 1), (1, 3), (2, 3), (3, 1)}

STAGE_NAMES = {
    1: "Labirintul navei",
    2: "Bomba cu memorie",
    3: "Panoul de cabluri",
    4: "Grila de securitate",
    5: "Terminalul de logica",
    6: "Circuitul de evacuare",
    7: "Misiune finalizata"
}


def new_game():
    game = {
        "stage": 1,
        "difficulty": 1,
        "mistakes": 0,
        "hints": 0,
        "successes": 0,
        "status": "playing",
        "feedback": "Nava este avariata. Gaseste drumul spre camera de control.",
        "maze_pos": [0, 0],
        "bomb_sequence": [],
        "bomb_input": [],
        "bomb_phase": "show",
        "bomb_show_until": 0,
        "bomb_deadline": 0,
        "wire_target": [],
        "wire_input": [],
        "grid_pos": [0, 0],
        "logic_answer": "",
        "circuit": [],
        "started_at": time.time()
    }
    enter_stage(game, 1)
    return game


def enter_stage(game, stage):
    game["stage"] = stage

    if stage == 1:
        game["maze_pos"] = [0, 0]
        game["feedback"] = "Navigheaza prin labirint pana la iesire."

    elif stage == 2:
        length = {1: 4, 2: 5, 3: 7}[game["difficulty"]]
        game["bomb_sequence"] = [
            random.choice(SYMBOLS) for _ in range(length)
        ]
        game["bomb_input"] = []
        game["bomb_phase"] = "show"
        game["bomb_show_until"] = time.time() + 3
        game["bomb_deadline"] = 0
        game["feedback"] = "Memoreaza simbolurile. Ai 3 secunde!"

    elif stage == 3:
        sequence = [0, 2, 1]
        if game["difficulty"] >= 2:
            sequence.append(3)
        if game["difficulty"] >= 3:
            sequence.append(4)

        game["wire_target"] = sequence
        game["wire_input"] = []
        game["feedback"] = "Selecteaza cablurile in ordinea afisata."

    elif stage == 4:
        game["grid_pos"] = [0, 0]
        game["feedback"] = "Ajungi la iesirea grilei fara sa atingi peretii."

    elif stage == 5:
        puzzles = {
            1: ("1, 1, 2, 3, 5, ?", "8"),
            2: ("2, 4, 8, 16, ?", "32"),
            3: ("1, 2, 4, 7, 11, ?", "16")
        }
        game["logic_question"], game["logic_answer"] = puzzles[
            game["difficulty"]
        ]
        game["feedback"] = "Descopera regula si introdu raspunsul."

    elif stage == 6:
        create_circuit(game)
        game["feedback"] = (
            "Roteste piesele pentru a conecta sursa la capsula de evacuare."
        )

    elif stage >= 7:
        game["stage"] = 7
        game["status"] = "won"
        game["feedback"] = "Ai reusit! Ai evacuat nava!"


def advance_stage(game):
    game["successes"] += 1
    game["difficulty"] = predict_difficulty(
        game["mistakes"], game["hints"], game["successes"]
    )
    enter_stage(game, game["stage"] + 1)


def fail_attempt(game, message):
    game["mistakes"] += 1
    game["feedback"] = message


def current_maze_walls(game):
    walls = set(MAZE_WALLS)
    if game["difficulty"] >= 2:
        walls.update({(2, 5), (4, 2), (5, 4)})
    if game["difficulty"] >= 3:
        walls.update({(1, 5), (3, 4), (5, 1)})
    return walls


def bomb_timeout(game):
    if (
        game["stage"] == 2
        and game["bomb_phase"] == "recall"
        and time.time() > game["bomb_deadline"]
    ):
        fail_attempt(game, "Timp expirat! Memoreaza noua secventa.")
        game["bomb_sequence"] = [
            random.choice(SYMBOLS)
            for _ in range({1: 4, 2: 5, 3: 7}[game["difficulty"]])
        ]
        game["bomb_input"] = []
        game["bomb_phase"] = "show"
        game["bomb_show_until"] = time.time() + 3
        game["bomb_deadline"] = 0



def circuit_solution():
    solution = [
        ("straight", 1), ("straight", 1),
        ("straight", 1), ("elbow", 2),
        ("elbow", 0), ("straight", 0),
        ("elbow", 1), ("straight", 0),
        ("elbow", 0), ("elbow", 2),
        ("straight", 0), ("straight", 0),
        ("elbow", 1), ("elbow", 0),
        ("elbow", 3), ("straight", 0)
    ]
    return solution



def create_circuit(game):
    solution = circuit_solution()
    tiles = []

    for index, (kind, correct_rotation) in enumerate(solution):
        rotation = random.randrange(4)
       if index in (0, 1, 2, 3, 7, 11, 15):
             # Aceste piese fac parte din traseul principal.
            rotation = (correct_rotation + random.choice([1, 2, 3])) % 4

        tiles.append({
            "kind": kind,
            "rotation": rotation
        })

    game["circuit"] = tiles


def ports(tile):
    if tile["kind"] == "straight":
        result = {"N", "S"}
    else:
        result = {"N", "E"}

    for _ in range(tile["rotation"] % 4):
        result = {
            {"N": "E", "E": "S", "S": "W", "W": "N"}[port]
            for port in result
        }

    return result


def circuit_is_connected(game):
    tiles = game["circuit"]
    visited = set()
    stack = [(0, 0)]
    directions = {
        "N": (-1, 0, "S"),
        "E": (0, 1, "W"),
        "S": (1, 0, "N"),
        "W": (0, -1, "E")
    }

    while stack:
        row, col = stack.pop()

        if (row, col) in visited:
            continue
        visited.add((row, col))

        tile_ports = ports(tiles[row * 4 + col])

        # Sursa intra din stanga; capsula se afla sub ultima piesa.
        if (row, col) == (0, 0) and "W" not in tile_ports:
            continue

        if (row, col) == (3, 3) and "S" in tile_ports:
            if "N" in tile_ports:
                return True

        for direction, (dr, dc, opposite) in directions.items():
            if direction not in tile_ports:
                continue

            nr, nc = row + dr, col + dc
            if not (0 <= nr < 4 and 0 <= nc < 4):
                continue

            neighbour_ports = ports(tiles[nr * 4 + nc])
            if opposite in neighbour_ports:
                stack.append((nr, nc))

    return False


def public_state(game):
    bomb_visible = (
        game["stage"] == 2
        and game["bomb_phase"] == "show"
        and time.time() < game["bomb_show_until"]
    )

    state = {
        "stage": game["stage"],
        "stage_name": STAGE_NAMES[game["stage"]],
        "difficulty": game["difficulty"],
        "mistakes": game["mistakes"],
        "hints": game["hints"],
        "successes": game["successes"],
        "status": game["status"],
        "feedback": game["feedback"],
        "maze_pos": game["maze_pos"],
        "maze_walls": [list(p) for p in current_maze_walls(game)],
        "grid_pos": game["grid_pos"],
        "grid_walls": [list(p) for p in GRID_WALLS],
        "wire_target": game["wire_target"],
        "wire_input": game["wire_input"],
        "bomb_phase": game["bomb_phase"],
        "bomb_sequence": game["bomb_sequence"] if bomb_visible else [],
        "bomb_input": game["bomb_input"],
        "bomb_deadline": game["bomb_deadline"],
        "bomb_show_until": game["bomb_show_until"],
        "symbols": SYMBOLS,
        "colors": COLORS,
        "logic_question": game.get("logic_question", ""),
        "circuit": game["circuit"],
        "circuit_ports": [
            sorted(ports(tile)) for tile in game["circuit"]
        ]
    }

    return state


def handle_action(game, action):
    bomb_timeout(game)

    if game["status"] != "playing":
        return public_state(game)

    kind = action.get("type")

    if kind == "hint":
        game["hints"] += 1
        hints = {
            1: "Cauta o ruta spre coltul din dreapta jos.",
            2: "Memoreaza simbolurile in ordinea afisata.",
            3: "Urmeaza secventa de culori afisata.",
            4: "Mergi spre dreapta si in jos, evitand peretii.",
            5: "Compara diferentele dintre termenii sirului.",
            6: "Roteste piesele astfel incat porturile sa se potriveasca."
        }
        game["feedback"] = hints[game["stage"]]
        return public_state(game)

    if kind == "maze_move" and game["stage"] == 1:
        directions = {
            "up": (-1, 0), "down": (1, 0),
            "left": (0, -1), "right": (0, 1)
        }
        move = directions.get(action.get("direction"))
        if move:
            row = game["maze_pos"][0] + move[0]
            col = game["maze_pos"][1] + move[1]
            walls = current_maze_walls(game)

            if 0 <= row < 7 and 0 <= col < 7 and (row, col) not in walls:
                game["maze_pos"] = [row, col]
                if [row, col] == [6, 6]:
                    advance_stage(game)
            else:
                fail_attempt(game, "Drum blocat! Incearca alta directie.")

    elif kind == "hide_bomb" and game["stage"] == 2:
        if game["bomb_phase"] == "show" and time.time() >= game["bomb_show_until"]:
            game["bomb_phase"] = "recall"
            game["bomb_input"] = []
            game["bomb_deadline"] = time.time() + {
                1: 12, 2: 10, 3: 8
            }[game["difficulty"]]
            game["feedback"] = "Repeta secventa inainte sa expire timpul!"

    elif kind == "bomb_pick" and game["stage"] == 2:
        if game["bomb_phase"] == "recall":
            symbol = action.get("symbol")
            if symbol not in SYMBOLS:
                return public_state(game)

            index = len(game["bomb_input"])
            if symbol == game["bomb_sequence"][index]:
                game["bomb_input"].append(symbol)
                if len(game["bomb_input"]) == len(game["bomb_sequence"]):
                    advance_stage(game)
                    game["feedback"] = "Bomba dezactivata!"
            else:
                fail_attempt(game, "Secventa gresita! Incearca din nou.")
                game["bomb_input"] = []
                game["bomb_phase"] = "show"
                game["bomb_show_until"] = time.time() + 3
                game["bomb_deadline"] = 0

    elif kind == "wire_pick" and game["stage"] == 3:
        color = action.get("color")
        if not isinstance(color, int) or color not in range(5):
            return public_state(game)

        index = len(game["wire_input"])
        if color == game["wire_target"][index]:
            game["wire_input"].append(color)
            if len(game["wire_input"]) == len(game["wire_target"]):
                advance_stage(game)
                game["feedback"] = "Cablurile au fost conectate corect!"
        else:
            fail_attempt(game, "Ordine gresita! Reincearca secventa.")
            game["wire_input"] = []

    elif kind == "grid_move" and game["stage"] == 4:
        directions = {
            "up": (-1, 0), "down": (1, 0),
            "left": (0, -1), "right": (0, 1)
        }
        move = directions.get(action.get("direction"))
        if move:
            row = game["grid_pos"][0] + move[0]
            col = game["grid_pos"][1] + move[1]
            walls = set(map(tuple, GRID_WALLS))

            if game["difficulty"] >= 2:
                walls.add((3, 3))

            if 0 <= row < 5 and 0 <= col < 5 and (row, col) not in walls:
                game["grid_pos"] = [row, col]
                if [row, col] == [4, 4]:
                    advance_stage(game)
            else:
                fail_attempt(game, "Acces blocat de sistemul de securitate.")

    elif kind == "logic_submit" and game["stage"] == 5:
        answer = str(action.get("answer", "")).strip()
        if answer == game["logic_answer"]:
            advance_stage(game)
        else:
            fail_attempt(game, "Raspuns incorect. Mai incearca.")

    elif kind == "circuit_rotate" and game["stage"] == 6:
        index = action.get("index")
        if isinstance(index, int) and 0 <= index < 16:
            game["circuit"][index]["rotation"] = (
                game["circuit"][index]["rotation"] + 1
            ) % 4

            if circuit_is_connected(game):
                advance_stage(game)
                game["feedback"] = "Circuit conectat! Capsula a fost activata."

    return public_state(game)
