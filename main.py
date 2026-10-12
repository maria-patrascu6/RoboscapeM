
STAGES = {
    1: {
        "name": "Labirintul",
        "description": "Ghidează robotul până la ieșirea din labirint.",
        "type": "maze",
    },
    2: {
        "name": "Reactorul",
        "description": "Reactorul are nevoie de codul numeric corect.",
        "type": "puzzle",
    },
    3: {
        "name": "Securitatea",
        "description": "Descifrează secvența de securitate.",
        "type": "puzzle",
    },
    4: {
        "name": "Evadarea finală",
        "description": "Rezolvă ultima provocare pentru a părăsi nava.",
        "type": "puzzle",
    },
}

MAZE = [
    [0, 0, 1, 0, 0],
    [1, 0, 1, 0, 1],
    [0, 0, 0, 0, 1],
    [0, 1, 1, 0, 0],
    [0, 0, 0, 1, 0],
]

PUZZLES = {
    1: {
        1: ("Completează secvența: 2, 4, 8, 16, ?", "32"),
        2: ("Completează secvența: 3, 6, 12, 24, ?", "48"),
        3: ("Completează secvența: 5, 11, 23, 47, ?", "95"),
    },
    2: {
        1: ("Completează secvența: 2, 4, 8, 16, ?", "32"),
        2: ("Completează secvența: 4, 9, 19, 39, ?", "79"),
        3: ("Completează secvența: 7, 15, 31, 63, ?", "127"),
    },
    3: {
        1: ("Completează secvența: 1, 4, 9, 16, ?", "25"),
        2: ("Completează secvența: 4, 9, 16, 25, ?", "36"),
        3: ("Completează secvența: 9, 25, 49, 81, ?", "121"),
    },
    4: {
        1: ("Completează secvența: 1, 2, 3, 5, 8, ?", "13"),
        2: ("Completează secvența: 2, 3, 5, 8, 13, ?", "21"),
        3: ("Completează secvența: 3, 5, 8, 13, 21, ?", "34"),
    },
}


def new_game():
    return {
        "stage": 1,
        "difficulty": 1,
        "x": 0,
        "y": 0,
        "mistakes": 0,
        "hints": 0,
        "message": "CORE: Sistemele navei sunt active. Găsește ieșirea!",
        "finished": False,
    }


def get_puzzle(stage, difficulty):
    return PUZZLES[stage][difficulty]


def move_player(game, direction):
    moves = {
        "up": (-1, 0),
        "down": (1, 0),
        "left": (0, -1),
        "right": (0, 1),
    }

    if direction not in moves:
        return "Direcție invalidă."

    dx, dy = moves[direction]
    nx = game["x"] + dx
    ny = game["y"] + dy

    if not (0 <= nx < 5 and 0 <= ny < 5):
        return "Nu poți ieși din labirint!"

    if MAZE[nx][ny] == 1:
        game["mistakes"] += 1
        return "Drumul este blocat! Încearcă altă direcție."

    game["x"] = nx
    game["y"] = ny

    if (nx, ny) == (4, 4):
        return "exit"

    return "Robotul a avansat."


def get_game_view(game):
    stage = game["stage"]
    result = {
        "stage": stage,
        "stage_name": "Misiune completă" if game["finished"] else STAGES[stage]["name"],
        "description": "Ai reușit să evadezi din navă!" if game["finished"] else STAGES[stage]["description"],
        "difficulty": game["difficulty"],
        "message": game["message"],
        "finished": game["finished"],
        "maze": MAZE,
        "x": game["x"],
        "y": game["y"],
        "mistakes": game["mistakes"],
        "hints": game["hints"],
        "puzzle": None,
    }

    if not game["finished"] and STAGES[stage]["type"] == "puzzle":
        question, _ = get_puzzle(stage, game["difficulty"])
        result["puzzle"] = question

    return result


def check_answer(game, answer):
    stage = game["stage"]

    if stage == 1:
        if (game["x"], game["y"]) == (4, 4):
            return True
        return False

    _, correct_answer = get_puzzle(stage, game["difficulty"])

    if str(answer).strip() == correct_answer:
        return True

    game["mistakes"] += 1
    game["message"] = "Cod incorect. Mai încearcă!"
    return False


def give_hint(game):
    game["hints"] += 1
    stage = game["stage"]

    if stage == 1:
        game["message"] = "CORE: Evită celulele blocate și caută drumul spre colțul din dreapta jos."
    elif stage == 2:
        game["message"] = "CORE: Observă cum se schimbă numerele de la un termen la următorul."
    elif stage == 3:
        game["message"] = "CORE: Uită-te la pătratele numerelor consecutive."
    else:
        game["message"] = "CORE: Fiecare termen se obține adunând cei doi termeni anteriori."


def advance_stage(game, new_difficulty):
    if game["stage"] >= 4:
        game["finished"] = True
        game["message"] = "Misiune reușită! Ai evadat din RoboScape."
        return

    game["stage"] += 1
    game["difficulty"] = max(1, min(3, int(new_difficulty)))
    game["x"] = 0
    game["y"] = 0
    game["message"] = (
        f"Etapa următoare. Dificultatea selectată: "
        f"{game['difficulty']} din 3."
    )
