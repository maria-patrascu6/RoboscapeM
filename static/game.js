const area = document.getElementById("game-area");
const feedback = document.getElementById("feedback");

let currentState = null;
let busy = false;
let hideRequested = false;

let bombInterval = null;
let bombTimeout = null;

const colorClasses = ["blue", "yellow", "purple", "green", "red"];
const colorHex = [
    "#64b5ff",
    "#ffe16a",
    "#c49bff",
    "#64f0ae",
    "#ff7589"
];

async function getState() {
    const response = await fetch("/state", {
        credentials: "same-origin"
    });

    if (!response.ok) {
        throw new Error("Nu s-a putut incarca jocul.");
    }

    return await response.json();
}

async function sendAction(action) {
    if (busy) return;

    busy = true;

    try {
        const response = await fetch("/action", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(action)
        });

        if (!response.ok) {
            throw new Error("Actiunea nu a reusit.");
        }

        const state = await response.json();
        render(state);

    } catch (error) {
        feedback.textContent =
            "Conexiunea cu serverul a fost intrerupta. Incearca din nou.";
    } finally {
        busy = false;
    }
}

function clearBombTimers() {
    if (bombInterval !== null) {
        clearInterval(bombInterval);
        bombInterval = null;
    }

    if (bombTimeout !== null) {
        clearTimeout(bombTimeout);
        bombTimeout = null;
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


// =====================================================
// LABIRINT
// =====================================================

function renderMaze(state) {
    addDescription(
        area,
        "Ghideaza robotul spre iesirea verde din coltul din dreapta jos."
    );

    const maze = document.createElement("div");
    maze.className = "maze";

    const walls = new Set(
        (state.maze_walls || []).map(position => position.join(","))
    );

    const [playerRow, playerCol] = state.maze_pos || [0, 0];

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


// =====================================================
// CONTROALE DE MISCARE
// =====================================================

function addDirections(parent, actionType) {
    const controls = document.createElement("div");
    controls.className = "controls";

    const items = [
        ["", ""],
        ["↑", "up"],
        ["", ""],
        ["←", "left"],
        ["↓", "down"],
        ["→", "right"]
    ];

    items.forEach(([label, direction]) => {
        if (!direction) {
            const blank = document.createElement("div");
            blank.className = "empty-control";
            controls.appendChild(blank);
            return;
        }

        controls.appendChild(
            makeButton(label, "control-button", () => {
                sendAction({
                    type: actionType,
                    direction: direction
                });
            })
        );
    });

    parent.appendChild(controls);
}


// =====================================================
// BOMBA
// =====================================================

function renderBomb(state) {
    const showing = state.bomb_phase === "show";

    addDescription(
        area,
        showing
            ? "Memoreaza simbolurile in ordinea afisata."
            : "Introdu simbolurile memorate in aceeasi ordine."
    );

    const timer = document.createElement("p");
    timer.className = "timer";
    area.appendChild(timer);

    if (showing) {
        const sequence = document.createElement("div");
        sequence.className = "memory-sequence";

        (state.bomb_sequence || []).forEach(symbol => {
            const item = document.createElement("div");
            item.className = "memory-symbol";
            item.textContent = symbol;
            sequence.appendChild(item);
        });

        area.appendChild(sequence);

        function updateMemoryTimer() {
            const remaining = Math.max(
                0,
                Math.ceil(
                    (state.bomb_show_until || 0) - Date.now() / 1000
                )
            );

            timer.textContent = `MEMOREAZA: ${remaining}s`;
        }

        updateMemoryTimer();

        bombInterval = setInterval(updateMemoryTimer, 250);

        const delay = Math.max(
            0,
            (state.bomb_show_until || 0) * 1000 - Date.now()
        );

        bombTimeout = setTimeout(() => {
            clearBombTimers();

            if (!hideRequested) {
                hideRequested = true;
                sendAction({ type: "hide_bomb" });
            }
        }, delay + 100);

        return;
    }

    const deadline = state.bomb_deadline || 0;

    const progress = document.createElement("p");
    progress.textContent =
        `Simboluri corecte: ${(state.bomb_input || []).length}`;

    area.appendChild(progress);

    const buttons = document.createElement("div");
    buttons.className = "symbol-buttons";

    (state.symbols || []).forEach(symbol => {
        buttons.appendChild(
            makeButton(symbol, "symbol-button", () => {
                sendAction({
                    type: "bomb_pick",
                    symbol: symbol
                });
            })
        );
    });

    area.appendChild(buttons);

    function updateInputTimer() {
        const remaining = Math.max(
            0,
            Math.ceil(deadline - Date.now() / 1000)
        );

        timer.textContent = `TIMP RAMAS: ${remaining}s`;

        if (remaining <= 0) {
            clearBombTimers();

            bombTimeout = setTimeout(() => {
                sendAction({ type: "tick" });
            }, 100);
        }
    }

    updateInputTimer();

    bombInterval = setInterval(updateInputTimer, 250);
}


// =====================================================
// CABLURI
// =====================================================

function renderWires(state) {
    addDescription(
        area,
        "Conecteaza culorile in ordinea indicata."
    );

    const target = document.createElement("div");
    target.className = "memory-sequence";

    (state.wire_target || []).forEach((colorIndex, index) => {
        const item = document.createElement("div");
        item.className = "memory-symbol";
        item.style.fontSize = "0.9rem";
        item.style.color = colorHex[colorIndex] || "#ffffff";

        const colorName = (state.colors || [])[colorIndex] || "?";

        item.textContent = `${index + 1}. ${colorName}`;
        target.appendChild(item);
    });

    area.appendChild(target);

    const progress = document.createElement("p");

    progress.textContent =
        `Conectate corect: ${(state.wire_input || []).length} / ${(state.wire_target || []).length}`;

    area.appendChild(progress);

    const buttons = document.createElement("div");
    buttons.className = "wire-buttons";

    (state.colors || []).forEach((color, index) => {
        buttons.appendChild(
            makeButton(
                color,
                `color-button ${colorClasses[index] || ""}`,
                () => {
                    sendAction({
                        type: "wire_pick",
                        color: index
                    });
                },
                (state.wire_input || []).includes(index)
            )
        );
    });

    area.appendChild(buttons);
}


// =====================================================
// GRILA DE SECURITATE
// =====================================================

function renderSecurityGrid(state) {
    addDescription(
        area,
        "Ghideaza robotul de la START la EXIT, evitand peretii."
    );

    const grid = document.createElement("div");
    grid.className = "security-grid";

    const walls = new Set(
        (state.grid_walls || []).map(position => position.join(","))
    );

    if (state.difficulty >= 2) {
        walls.add("3,3");
    }

    const [playerRow, playerCol] = state.grid_pos || [0, 0];

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


// =====================================================
// PUZZLE LOGIC
// =====================================================

function renderLogic(state) {
    addDescription(
        area,
        "Rezolva secventa numerica pentru a debloca reactorul."
    );

    const question = document.createElement("h3");
    question.textContent = state.logic_question || "Puzzle logic";
    question.style.fontSize = "1.4rem";

    area.appendChild(question);

    const form = document.createElement("form");
    form.className = "answer-form";

    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "numeric";
    input.placeholder = "Raspuns";
    input.required = true;
    input.setAttribute("aria-label", "Raspuns");

    const submit = document.createElement("button");
    submit.className = "primary-button";
    submit.type = "submit";
    submit.textContent = "Verifica";

    form.append(input, submit);

    form.addEventListener("submit", event => {
        event.preventDefault();

        sendAction({
            type: "logic_submit",
            answer: input.value
        });
    });

    area.appendChild(form);
}


// =====================================================
// CIRCUIT FINAL
// =====================================================

function renderCircuit(state) {
    addDescription(
        area,
        "Apasa piesele pentru a le roti si a conecta sursa la capsula."
    );

    const legend = document.createElement("p");
    legend.className = "circuit-legend";
    legend.textContent = "SURSĂ ◀ → CIRCUIT → CAPSULĂ ▼";

    area.appendChild(legend);

    const grid = document.createElement("div");
    grid.className = "circuit-grid";

    (state.circuit || []).forEach((tile, index) => {
        const button = document.createElement("button");

        button.className = `circuit-tile ${tile.kind}`;
        button.setAttribute(
            "aria-label",
            `Roteste piesa ${index + 1}`
        );

        const pipe = document.createElement("span");
        pipe.className = "pipe";
        pipe.textContent = tile.kind === "straight" ? "│" : "└";
        pipe.style.transform = `rotate(${tile.rotation * 90}deg)`;

        button.appendChild(pipe);

        button.addEventListener("click", () => {
            sendAction({
                type: "circuit_rotate",
                index: index
            });
        });

        grid.appendChild(button);
    });

    area.appendChild(grid);
}


// =====================================================
// ECRAN FINAL
// =====================================================

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
        `Ai terminat misiunea. Greseli: ${state.mistakes}. ` +
        `Indicii folosite: ${state.hints}.`;

    panel.append(icon, title, description);
    area.appendChild(panel);
}


// =====================================================
// AFISAREA INTERFETEI
// =====================================================

function render(state) {
    clearBombTimers();
    currentState = state;

    if (state.bomb_phase !== "show") {
        hideRequested = false;
    }

    const stageNumber = document.getElementById("stage-number");
    const difficulty = document.getElementById("difficulty");
    const mistakes = document.getElementById("mistakes");
    const hints = document.getElementById("hints");
    const stageName = document.getElementById("stage-name");
    const stageLabel = document.getElementById("stage-label");

    stageNumber.textContent =
        state.stage === 7 ? "6 / 6" : `${state.stage} / 6`;

    const difficultyNames = {
        1: "Usor",
        2: "Mediu",
        3: "Dificil"
    };

    difficulty.textContent =
        difficultyNames[state.difficulty] || state.difficulty;

    mistakes.textContent = state.mistakes;
    hints.textContent = state.hints;
    stageName.textContent = state.stage_name;

    stageLabel.textContent =
        state.stage === 7
            ? "MISSION COMPLETE"
            : `STAGE ${String(state.stage).padStart(2, "0")}`;

    feedback.textContent = state.feedback || "";

    area.replaceChildren();

    if (state.status === "won" || state.stage === 7) {
        renderVictory(state);
        return;
    }

    switch (state.stage) {
        case 1:
            renderMaze(state);
            break;

        case 2:
            renderBomb(state);
            break;

        case 3:
            renderWires(state);
            break;

        case 4:
            renderSecurityGrid(state);
            break;

        case 5:
            renderLogic(state);
            break;

        case 6:
            renderCircuit(state);
            break;

        default:
            area.textContent = "Etapa nu este disponibila.";
    }
}


// =====================================================
// BUTOANELE GENERALE
// =====================================================

document.getElementById("hint-button").addEventListener("click", () => {
    sendAction({ type: "hint" });
});

document.getElementById("restart-button").addEventListener("click", async () => {
    if (!confirm("Vrei sa reincepi misiunea de la prima etapa?")) {
        return;
    }

    if (busy) return;

    busy = true;
    clearBombTimers();
    hideRequested = false;

    try {
        const response = await fetch("/restart", {
            method: "POST",
            credentials: "same-origin"
        });

        if (!response.ok) {
            throw new Error("Nu s-a putut reporni jocul.");
        }

        const state = await response.json();
        render(state);

    } catch (error) {
        feedback.textContent =
            "Nu am putut reporni jocul. Reincarca pagina.";

    } finally {
        busy = false;
    }
});


// =====================================================
// INCARCAREA INITIALA
// Nu exista actualizare continua a intregii pagini.
// =====================================================

async function startGame() {
    feedback.textContent = "Se incarca misiunea...";

    try {
        const state = await getState();
        render(state);

    } catch (error) {
        feedback.textContent =
            "Conexiunea cu serverul a fost intrerupta. " +
            "
