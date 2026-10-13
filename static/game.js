
const startScreen = document.getElementById("start-screen");
const gameScreen = document.getElementById("game-screen");
const finishScreen = document.getElementById("finish-screen");

const challengeElement = document.getElementById("challenge");
const gameMessage = document.getElementById("game-message");

let currentState = null;
let answer = null;
let selectedNumbers = [];
let memorySequence = [];
let wireAssignments = {};
let circuitSequence = [];
let mazePosition = 0;

async function api(url, method = "GET", data = null) {
    const options = {
        method,
        headers: {}
    };

    if (data !== null) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.error || "A apărut o eroare.");
    }

    return result;
}

function showError(element, message) {
    element.textContent = message;
    element.classList.add("error");
}

function clearMessage() {
    gameMessage.textContent = "";
    gameMessage.className = "";
}

document.getElementById("start-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("player-name").value.trim();
    const errorElement = document.getElementById("start-error");
    errorElement.textContent = "";

    if (!name) {
        showError(errorElement, "Introdu numele înainte să începi.");
        return;
    }

    try {
        const state = await api("/start", "POST", { name });
        renderState(state);
    } catch (error) {
        showError(errorElement, error.message);
    }
});

function renderState(state) {
    currentState = state;

    if (state.status === "completed") {
        startScreen.classList.add("hidden");
        gameScreen.classList.add("hidden");
        finishScreen.classList.remove("hidden");

        document.getElementById("finish-message").textContent =
            `${state.name}, ai terminat toate cele 6 etape!`;
        loadLeaderboard();
        return;
    }

    if (state.status !== "playing") {
        return;
    }

    startScreen.classList.add("hidden");
    finishScreen.classList.add("hidden");
    gameScreen.classList.remove("hidden");

    document.getElementById("player-label").textContent =
        `Jucător: ${state.name}`;

    document.getElementById("difficulty-label").textContent =
        `Dificultate: ${state.difficulty_name}`;

    document.getElementById("stage-counter").textContent =
        `Etapa ${state.stage_number} din ${state.stages_total}`;

    document.getElementById("stage-title").textContent =
        state.stage_name;

    document.getElementById("stage-description").textContent =
        state.challenge.description;

    document.getElementById("progress-bar").style.width =
        `${(state.stage / state.stages_total) * 100}%`;

    clearMessage();
    answer = null;
    selectedNumbers = [];
    memorySequence = [];
    wireAssignments = {};
    circuitSequence = [];

    renderChallenge(state.challenge);
}

function addChoice(container, text, value, callback) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";
    button.textContent = text;

    button.addEventListener("click", () => {
        container.querySelectorAll(".choice").forEach(item => {
            item.classList.remove("selected");
        });

        button.classList.add("selected");
        callback(value);
    });

    container.appendChild(button);
    return button;
}

function renderChallenge(challenge) {
    challengeElement.replaceChildren();

    if (challenge.type === "maze") {
        renderMaze(challenge.size);
    } else if (challenge.type === "memory") {
        renderMemory(challenge.shapes);
    } else if (challenge.type === "wires") {
        renderWires(challenge.wires, challenge.targets);
    } else if (challenge.type === "grid") {
        renderGrid(challenge.size, challenge.numbers);
    } else if (challenge.type === "logic") {
        renderLogic(challenge.question);
    } else if (challenge.type === "circuit") {
        renderCircuit(challenge.sequence);
    }
}

function renderMaze(size) {
    const instruction = document.createElement("p");
    instruction.textContent =
        "Alege o direcție pentru a muta robotul. Ajungi la ieșire?";
    challengeElement.appendChild(instruction);

    const maze = document.createElement("div");
    maze.className = "maze";
    maze.style.gridTemplateColumns = `repeat(${size}, 1fr)`;

    const walls = new Set();

    // Generează un traseu simplu, fără ziduri pe prima linie.
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if ((r + c) % 4 === 0 && r !== 0 && c !== size - 1) {
                walls.add(r * size + c);
            }
        }
    }

    walls.delete(0);
    walls.delete(size * size - 1);

    mazePosition = 0;
    let position = 0;

    function drawMaze() {
        maze.replaceChildren();

        for (let i = 0; i < size * size; i++) {
            const cell = document.createElement("div");
            cell.className = "maze-cell";

            if (walls.has(i)) {
                cell.classList.add("wall");
                cell.textContent = "■";
            } else if (i === position) {
                cell.classList.add("robot");
                cell.textContent = "🤖";
            } else if (i === size * size - 1) {
                cell.classList.add("exit");
                cell.textContent = "🚪";
            }

            maze.appendChild(cell);
        }
    }

    const controls = document.createElement("div");
    controls.className = "symbol-row";

    [
        ["↑", -size],
        ["←", -1],
        ["→", 1],
        ["↓", size]
    ].forEach(([label, delta]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.className = "choice";

        button.addEventListener("click", () => {
            const next = position + delta;

            if (next < 0 || next >= size * size || walls.has(next)) {
                gameMessage.textContent = "Drumul este blocat.";
                return;
            }

            if (delta === -1 && Math.floor(next / size) !== Math.floor(position / size)) return;
            if (delta === 1 && Math.floor(next / size) !== Math.floor(position / size)) return;

            position = next;
            drawMaze();

            if (position === size * size - 1) {
                answer = "exit";
                gameMessage.textContent = "Ai ajuns la ieșire! Apasă «Verifică răspunsul».";
            }
        });

        controls.appendChild(button);
    });

    challengeElement.appendChild(maze);
    challengeElement.appendChild(controls);
    drawMaze();
}

function renderMemory(shapes) {
    const info = document.createElement("p");
    info.textContent = "Memorează simbolurile, apoi apasă «Ascunde simbolurile».";
    challengeElement.appendChild(info);

    const row = document.createElement("div");
    row.className = "symbol-row";

    shapes.forEach(shape => {
        const tile = document.createElement("div");
        tile.className = "choice";
        tile.textContent = shape;
        tile.style.display = "grid";
        tile.style.placeItems = "center";
        tile.style.fontSize = "28px";
        row.appendChild(tile);
    });

    challengeElement.appendChild(row);

    const hideButton = document.createElement("button");
    hideButton.type = "button";
    hideButton.textContent = "Ascunde simbolurile";

    hideButton.addEventListener("click", () => {
        row.replaceChildren();
        info.textContent = "Alege cele 6 simboluri în ordinea corectă.";

        const choices = [...shapes].sort(() => Math.random() - 0.5);

        choices.forEach(shape => {
            addChoice(row, shape, shape, value => {
                memorySequence.push(value);

                if (memorySequence.length > 6) {
                    memorySequence.shift();
                }

                answer = memorySequence.length === 6
                    ? memorySequence.slice()
                    : null;

                gameMessage.textContent =
                    `Simboluri alese: ${memorySequence.length}/6`;
            });
        });
    });

    challengeElement.appendChild(hideButton);

    // Soluția este reținută doar pentru verificarea locală a selecției.
    // Ordinea afișată este ordinea corectă a secvenței.
    window.expectedMemorySequence = shapes.slice();
}

function renderWires(wires, targets) {
    const info = document.createElement("p");
    info.textContent = "Selectează un cablu, apoi selectează poziția corespunzătoare.";
    challengeElement.appendChild(info);

    const source = document.createElement("div");
    source.className = "wire-list";

    const targetBox = document.createElement("div");
    targetBox.className = "wire-targets";

    let selectedWire = null;

    wires.forEach(color => {
        const wire = document.createElement("button");
        wire.type = "button";
        wire.className = "wire";
        wire.dataset.color = color;
        wire.textContent = color;
        wire.draggable = true;

        wire.addEventListener("click", () => {
            selectedWire = color;
            source.querySelectorAll(".wire").forEach(item => {
                item.classList.remove("selected");
            });
            wire.classList.add("selected");
        });

        wire.addEventListener("dragstart", event => {
            event.dataTransfer.setData("text/plain", color);
        });

        source.appendChild(wire);
    });

    targets.forEach(color => {
        const target = document.createElement("div");
        target.className = "wire-target";
        target.textContent = `Poziția: ${color}`;
        target.dataset.target = color;

        function assignWire(wireColor) {
            wireAssignments[color] = wireColor;
            target.textContent = `${color}: ${wireColor}`;
            target.classList.add("filled");

            answer = targets.map(targetColor =>
                wireAssignments[targetColor]
            );

            if (Object.keys(wireAssignments).length === targets.length) {
                answer = targets.map(targetColor =>
                    wireAssignments[targetColor]
                );
            }
        }

        target.addEventListener("click", () => {
            if (selectedWire) {
                assignWire(selectedWire);
            }
        });

        target.addEventListener("dragover", event => event.preventDefault());

        target.addEventListener("drop", event => {
            event.preventDefault();
            assignWire(event.dataTransfer.getData("text/plain"));
        });

        targetBox.appendChild(target);
    });

    challengeElement.appendChild(source);
    challengeElement.appendChild(targetBox);
}

function renderGrid(size, numbers) {
    const grid = document.createElement("div");
    grid.className = "number-grid";
    grid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;

    numbers.forEach(number => {
        addChoice(grid, String(number), number, value => {
            if (!selectedNumbers.includes(value)) {
                selectedNumbers.push(value);
            }

            answer = selectedNumbers.slice();
            gameMessage.textContent =
                `Numere selectate: ${selectedNumbers.join(", ")}`;
        });
    });

    challengeElement.appendChild(grid);
}

function renderLogic(question) {
    const text = document.createElement("p");
    text.textContent = question;
    challengeElement.appendChild(text);

    const input = document.createElement("input");
    input.type = "number";
    input.placeholder = "Răspunsul tău";
    input.addEventListener("input", () => {
        answer = input.value;
    });

    challengeElement.appendChild(input);
}

function renderCircuit(sequence) {
    const info = document.createElement("p");
    info.textContent = "Activează componentele în ordinea 1, 2, 3, 4.";
    challengeElement.appendChild(info);

    const grid = document.createElement("div");
    grid.className = "circuit-grid";

    [1, 2, 3, 4].sort(() => Math.random() - 0.5).forEach(number => {
        addChoice(grid, `Componenta ${number}`, number, value => {
            if (!circuitSequence.includes(value)) {
                circuitSequence.push(value);
            }

            answer = circuitSequence.slice();
            gameMessage.textContent =
                `Componente activate: ${circuitSequence.join(", ")}`;
        });
    });

    challengeElement.appendChild(grid);
}

document.getElementById("submit-answer").addEventListener("click", async () => {
    if (answer === null) {
        gameMessage.textContent = "Rezolvă etapa înainte de a continua.";
        return;
    }

    // Pentru memoria vizuală, secvența corectă este cea afișată inițial.
    if (currentState.challenge.type === "memory") {
        answer = memorySequence.slice();
    }

    try {
        const result = await api("/action", "POST", {
            type: "solve",
            answer
        });

        gameMessage.textContent = result.message;
        gameMessage.className = result.correct ? "success" : "error";

        if (!result.correct) {
            currentState = result.state;
            return;
        }

        renderState(result.state);
    } catch (error) {
        gameMessage.textContent = error.message;
        gameMessage.className = "error";
    }
});

async function loadLeaderboard() {
    const list = document.getElementById("leaderboard-list");
    list.replaceChildren();

    try {
        const results = await api("/leaderboard");

        if (results.length === 0) {
            const item = document.createElement("li");
            item.textContent = "Nu există rezultate încă.";
            list.appendChild(item);
            return;
        }

        results.forEach(result => {
            const item = document.createElement("li");
            item.textContent =
                `${result.name} — ${result.stages_completed}/6 etape, ` +
                `${result.time_seconds} secunde`;
            list.appendChild(item);
        });
    } catch (error) {
        const item = document.createElement("li");
        item.textContent = "Clasamentul nu este disponibil momentan.";
        list.appendChild(item);
    }
}

document.getElementById("leaderboard-button").addEventListener(
    "click",
    loadLeaderboard
);

document.getElementById("restart-button").addEventListener("click", () => {
    finishScreen.classList.add("hidden");
    gameScreen.classList.add("hidden");
    startScreen.classList.remove("hidden");
    document.getElementById("player-name").value = "";
    document.getElementById("start-error").textContent = "";
});

loadLeaderboard();
