
const area = document.getElementById("game-area");
const feedback = document.getElementById("feedback");

let currentState = null;
let hideRequested = false;
let busy = false;

const colorClasses = ["blue", "yellow", "purple", "green", "red"];

async function getState() {
    const response = await fetch("/state");
    if (!response.ok) throw new Error("Nu s-a putut incarca jocul.");
    return response.json();
}

async function sendAction(action) {
    if (busy) return;
    busy = true;

    try {
        const response = await fetch("/action", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(action)
        });

        if (!response.ok) throw new Error("Actiunea nu a reusit.");
        currentState = await response.json();
        render(currentState);
    } catch (error) {
        feedback.textContent = "Eroare de conexiune. Reincarca pagina.";
    } finally {
        busy = false;
    }
}

function makeButton(text, className, action, disabled = false) {
    const button = document.createElement("button");
    button.textContent = text;
    button.className = className;
    button.disabled = disabled;
    button.addEventListener("click", action);
    return button;
}

function addDescription(parent, text) {
    const paragraph = document.createElement("p");
    paragraph.className = "game-description";
    paragraph.textContent = text;
    parent.appendChild(paragraph);
}

function renderMaze(state) {
    addDescription(
        area,
        "Foloseste sagetile pentru a ajunge la iesirea verde din coltul din dreapta jos."
    );

    const maze = document.createElement("div");
    maze.className = "maze";

    const walls = new Set(state.maze_walls.map(p => p.join(",")));
    const [playerRow, playerCol] = state.maze_pos;

    for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 7; col++) {
            const cell = document.createElement("div");
            cell.className = "maze-cell";

            if (walls.has(`${row},${col}`)) {
                cell.classList.add("wall");
                cell.textContent = "■";
            } else if (row === playerRow && col === playerCol) {
                cell.classList.add("player");
                cell.textContent = "🤖";
            } else if (row === 6 && col === 6) {
                cell.classList.add("exit");
                cell.textContent = "EXIT";
            } else {
                cell.textContent = "·";
            }

            maze.appendChild(cell);
        }
    }

    area.appendChild(maze);
    addDirections(area, "maze_move");
}

function addDirections(parent, actionType) {
    const controls = document.createElement("div");
    controls.className = "controls";

    const items = [
        ["", ""], ["↑", "up"], ["", ""],
        ["←", "left"], ["↓", "down"], ["→", "right"]
    ];

    items.forEach(([label, direction]) => {
        if (!direction) {
            const blank = document.createElement("div");
            blank.className = "empty-control";
            controls.appendChild(blank);
            return;
        }

        controls.appendChild(
            makeButton(label, "control-button", () =>
                sendAction({type: actionType, direction})
            )
        );
    });

    parent.appendChild(controls);
}

function renderBomb(state) {
    const showing = state.bomb_phase === "show";

    addDescription(
        area,
        showing
            ? "Memoreaza simbolurile in ordinea afisata. Dupa disparitie, reproduce secventa."
            : "Selecteaza simbolurile in aceeasi ordine. Nu lasa timpul sa expire."
    );

    if (showing) {
        const sequence = document.createElement("div");
        sequence.className = "memory-sequence";

        state.bomb_sequence.forEach(symbol => {
            const item = document.createElement("div");
            item.className = "memory-symbol";
            item.textContent = symbol;
            sequence.appendChild(item);
        });

        area.appendChild(sequence);

        const remaining = Math.max(
            0, Math.ceil(state.bomb_show_until - Date.now() / 1000)
        );

        const timer = document.createElement("p");
        timer.className = "timer";
        timer.textContent = `MEMOREAZA: ${remaining}s`;
        area.appendChild(timer);

        if (remaining <= 0 && !hideRequested) {
            hideRequested = true;
            sendAction({type: "hide_bomb"});
        }
        return;
    }

    hideRequested = false;

    const remaining = Math.max(
        0, Math.ceil(state.bomb_deadline - Date.now() / 1000)
    );

    const timer = document.createElement("p");
    timer.className = "timer";
    timer.textContent = `TIMP RAMAS: ${remaining}s`;
    area.appendChild(timer);

    const progress = document.createElement("p");
    progress.textContent =
        `Simboluri corecte: ${state.bomb_input.length}`;
    area.appendChild(progress);

    const buttons = document.createElement("div");
    buttons.className = "symbol-buttons";

    state.symbols.forEach(symbol => {
        buttons.appendChild(
            makeButton(symbol, "symbol-button", () =>
                sendAction({type: "bomb_pick", symbol})
            )
        );
    });

    area.appendChild(buttons);
}

function renderWires(state) {
    addDescription(
        area,
        "Ordinea necesara este afisata mai jos. Apasa cablurile unul cate unul, de la primul la ultimul."
    );

    const target = document.createElement("div");
    target.className = "memory-sequence";

    state.wire_target.forEach((colorIndex, i) => {
        const item = document.createElement("div");
        item.className = "memory-symbol";
        item.style.fontSize = "0.9rem";
        item.style.color = ["#64b5ff", "#ffe16a", "#c49bff", "#64f0ae", "#ff7589"][colorIndex];
        item.textContent = `${i + 1}. ${state.colors[colorIndex]}`;
        target.appendChild(item);
    });

    area.appendChild(target);

    const progress = document.createElement("p");
    progress.textContent = `Conectate corect: ${state.wire_input.length} / ${state.wire_target.length}`;
    area.appendChild(progress);

    const buttons = document.createElement("div");
    buttons.className = "wire-buttons";

    state.colors.forEach((color, index) => {
        buttons.appendChild(
            makeButton(
                color,
                `color-button ${colorClasses[index]}`,
                () => sendAction({type: "wire_pick", color: index})
            )
        );
    });

    area.appendChild(buttons);
}

function renderSecurityGrid(state) {
    addDescription(
        area,
        "Navigheaza de la START in coltul din stanga sus pana la EXIT. Evita peretii."
    );

    const grid = document.createElement("div");
    grid.className = "security-grid";

    const walls = new Set(state.grid_walls.map(p => p.join(",")));
    if (state.difficulty >= 2) walls.add("3,3");

    const [playerRow, playerCol] = state.grid_pos;

    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            const cell = document.createElement("div");
            cell.className = "security-cell";

            if (walls.has(`${row},${col}`)) {
                cell.classList.add("wall");
                cell.textContent = "■";
            } else if (row === playerRow && col === playerCol) {
                cell.classList.add("player");
                cell.textContent = "🤖";
            } else if (row === 4 && col === 4) {
                cell.classList.add("exit");
                cell.textContent = "EXIT";
            } else {
                cell.textContent = "·";
            }

            grid.appendChild(cell);
        }
    }

    area.appendChild(grid);
    addDirections(area, "grid_move");
}

function renderLogic(state) {
    addDescription(area, "Completeaza secventa numerica:");

    const question = document.createElement("h3");
    question.textContent = state.logic_question;
    question.style.fontSize = "1.5rem";
    area.appendChild(question);

    const form = document.createElement("form");
    form.className = "answer-form";

    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "numeric";
    input.placeholder = "Raspuns";
    input.required = true;
    input.setAttribute("aria-label", "Raspunsul la secventa");

    const submit = document.createElement("button");
    submit.className = "primary-button";
    submit.textContent = "Verifica";

    form.append(input, submit);
    form.addEventListener("submit", event => {
        event.preventDefault();
        sendAction({type: "logic_submit", answer: input.value});
    });

    area.appendChild(form);
}

function renderCircuit(state) {
    addDescription(
        area,
        "Roteste piesele pana cand conectezi sursa din stanga sus cu iesirea din partea de jos. Apasa o piesa pentru a o roti."
    );

    const legend = document.createElement("p");
    legend.className = "circuit-legend";
    legend.textContent = "SURSĂ ◀  →  CIRCUIT  →  CAPSULĂ ▼";
    area.appendChild(legend);

    const grid = document.createElement("div");
    grid.className = "circuit-grid";

    state.circuit.forEach((tile, index) => {
        const button = document.createElement("button");
        button.className = `circuit-tile ${tile.kind}`;
        button.setAttribute("aria-label", `Roteste piesa ${index + 1}`);

        const pipe = document.createElement("span");
        pipe.className = "pipe";
        pipe.textContent = tile.kind === "straight" ? "│" : "└";
        pipe.style.transform = `rotate(${tile.rotation * 90}deg)`;

        button.appendChild(pipe);
        button.addEventListener("click", () =>
            sendAction({type: "circuit_rotate", index})
        );

        grid.appendChild(button);
    });

    area.appendChild(grid);
}

function renderVictory(state) {
    const panel = document.createElement("div");
    panel.className = "victory";

    const icon = document.createElement("div");
    icon.className = "victory-icon";
    icon.textContent = "🚀";

    const title = document.createElement("h3");
    title.textContent = "MISIUNE REUSITA";

    const description = document.createElement("p");
    description.textContent =
        `Ai terminat misiunea cu dificultatea ${state.difficulty}, ${state.mistakes} greseli si ${state.hints} indicii.`;

    panel.append(icon, title, description);
    area.appendChild(panel);
}

function render(state) {
    currentState = state;

    document.getElementById("stage-number").textContent =
        state.stage === 7 ? "6 / 6" : `${state.stage} / 6`;

    document.getElementById("difficulty").textContent = state.difficulty;
    document.getElementById("mistakes").textContent = state.mistakes;
    document.getElementById("hints").textContent = state.hints;
    document.getElementById("stage-name").textContent = state.stage_name;
    document.getElementById("stage-label").textContent =
        state.stage === 7 ? "MISSION COMPLETE" :
        `STAGE ${String(state.stage).padStart(2, "0")}`;

    feedback.textContent = state.feedback;
    area.replaceChildren();

    if (state.status === "won" || state.stage === 7) {
        renderVictory(state);
        return;
    }

    switch (state.stage) {
        case 1: renderMaze(state); break;
        case 2: renderBomb(state); break;
        case 3: renderWires(state); break;
        case 4: renderSecurityGrid(state); break;
        case 5: renderLogic(state); break;
        case 6: renderCircuit(state); break;
        default:
            area.textContent = "Etapa nu este disponibila.";
    }
}

document.getElementById("hint-button").addEventListener("click", () => {
    sendAction({type: "hint"});
});

document.getElementById("restart-button").addEventListener("click", async () => {
    if (!confirm("Vrei sa reincepi misiunea de la prima etapa?")) return;

    hideRequested = false;

    const response = await fetch("/restart", {method: "POST"});
    currentState = await response.json();
    render(currentState);
});

async function refreshState() {
    try {
        const state = await getState();

        if (state.bomb_phase !== "show") {
            hideRequested = false;
        }

        render(state);
    } catch (error) {
        feedback.textContent = "Conexiunea cu serverul a fost intrerupta.";
    }
}

refreshState();
setInterval(refreshState, 500);
