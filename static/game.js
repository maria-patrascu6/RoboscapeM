
const area = document.getElementById("game-area");
const feedback = document.getElementById("feedback");

let currentState = null;
let busy = false;
let loading = false;

const colorClasses = ["blue", "yellow", "purple", "green", "red"];
const colorHex = ["#64b5ff", "#ffe16a", "#c49bff", "#64f0ae", "#ff7589"];

async function getState() {
    const response = await fetch("/state", {
        credentials: "same-origin",
        cache: "no-store"
    });

    if (!response.ok) {
        throw new Error("Serverul a returnat eroarea " + response.status);
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
            throw new Error("Actiunea nu a putut fi executata.");
        }

        const result = await response.json();

        currentState = result;
        render(result);
    } catch (error) {
        console.error("Eroare la actiune:", error);
        feedback.textContent =
            "Nu s-a putut executa actiunea. Incearca din nou.";
    } finally {
        busy = false;
    }
}

function makeButton(text, className, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", action);
    return button;
}

function addDescription(text) {
    const paragraph = document.createElement("p");
    paragraph.className = "game-description";
    paragraph.textContent = text;
    area.appendChild(paragraph);
}

function renderMaze(state) {
    addDescription(
        "Ghideaza robotul pana la iesirea verde din coltul din dreapta jos."
    );

    const maze = document.createElement("div");
    maze.className = "maze";

    const walls = new Set(
        state.maze_walls.map(position => position.join(","))
    );

    const playerRow = state.maze_pos[0];
    const playerCol = state.maze_pos[1];

    for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 7; col++) {
            const cell = document.createElement("div");
            cell.className = "maze-cell";

            if (walls.has(row + "," + col)) {
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
    addDirections("maze_move");
}

function addDirections(actionType) {
    const controls = document.createElement("div");
    controls.className = "controls";

    const directions = [
        ["", ""],
        ["↑", "up"],
        ["", ""],
        ["←", "left"],
        ["↓", "down"],
        ["→", "right"]
    ];

    directions.forEach(item => {
        const label = item[0];
        const direction = item[1];

        if (direction === "") {
            const empty = document.createElement("div");
            empty.className = "empty-control";
            controls.appendChild(empty);
        } else {
            controls.appendChild(
                makeButton(label, "control-button", () => {
                    sendAction({
                        type: actionType,
                        direction: direction
                    });
                })
            );
        }
    });

    area.appendChild(controls);
}

function renderBomb(state) {
    const showing = state.bomb_phase === "show";

    addDescription(
        showing
            ? "Memoreaza simbolurile in ordinea afisata."
            : "Selecteaza simbolurile in ordinea in care au aparut."
    );

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

        const timer = document.createElement("p");
        timer.className = "timer";

        const remaining = Math.max(
            0,
            Math.ceil(state.bomb_show_until - Date.now() / 1000)
        );

        timer.textContent = "MEMOREAZA: " + remaining + "s";
        area.appendChild(timer);
        return;
    }

    const remaining = Math.max(
        0,
        Math.ceil(state.bomb_deadline - Date.now() / 1000)
    );

    const timer = document.createElement("p");
    timer.className = "timer";
    timer.textContent = "TIMP RAMAS: " + remaining + "s";
    area.appendChild(timer);

    const progress = document.createElement("p");
    progress.textContent =
        "Simboluri corecte: " + state.bomb_input.length;
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
}

function renderWires(state) {
    addDescription(
        "Conecteaza culorile in ordinea indicata. Daca gresesti, reia secventa."
    );

    const target = document.createElement("div");
    target.className = "memory-sequence";

    state.wire_target.forEach((colorIndex, index) => {
        const item = document.createElement("div");
        item.className = "memory-symbol";
        item.style.color = colorHex[colorIndex];
        item.textContent =
            (index + 1) + ". " + state.colors[colorIndex];

        target.appendChild(item);
    });

    area.appendChild(target);

    const progress = document.createElement("p");
    progress.textContent =
        "Conectate corect: " +
        state.wire_input.length +
        " / " +
        state.wire_target.length;

    area.appendChild(progress);

    const buttons = document.createElement("div");
    buttons.className = "wire-buttons";

    state.colors.forEach((color, index) => {
        buttons.appendChild(
            makeButton(
                color,
                "color-button " + colorClasses[index],
                () => {
                    sendAction({
                        type: "wire_pick",
                        color: index
                    });
                }
            )
        );
    });

    area.appendChild(buttons);
}

function renderSecurityGrid(state) {
    addDescription(
        "Muta robotul de la START la EXIT. Evita peretii."
    );

    const grid = document.createElement("div");
    grid.className = "security-grid";

    const walls = new Set(
        state.grid_walls.map(position => position.join(","))
    );

    if (state.difficulty >= 2) {
        walls.add("3,3");
    }

    const playerRow = state.grid_pos[0];
    const playerCol = state.grid_pos[1];

    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            const cell = document.createElement("div");
            cell.className = "security-cell";

            if (walls.has(row + "," + col)) {
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
    addDirections("grid_move");
}

function renderLogic(state) {
    addDescription("Gaseste numarul care completeaza sirul.");

    const question = document.createElement("h3");
    question.textContent = state.logic_question;
    question.style.fontSize = "1.4rem";
    area.appendChild(question);

    const form = document.createElement("form");
    form.className = "answer-form";

    const input = document.createElement("input");
    input.type = "number";
    input.placeholder = "Introdu raspunsul";
    input.setAttribute("aria-label", "Raspuns");
    input.required = true;

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "primary-button";
    submit.textContent = "Verifica raspunsul";

    form.appendChild(input);
    form.appendChild(submit);

    form.addEventListener("submit", event => {
        event.preventDefault();

        sendAction({
            type: "logic_submit",
            answer: input.value
        });
    });

    area.appendChild(form);
}

function renderCircuit(state) {
    addDescription(
        "Roteste piesele pana cand conectezi sursa din coltul stanga sus cu iesirea de jos."
    );

    const legend = document.createElement("p");
    legend.className = "circuit-legend";
    legend.textContent = "Sursa → Circuit → Capsula";
    area.appendChild(legend);

    const grid = document.createElement("div");
    grid.className = "circuit-grid";

    state.circuit.forEach((tile, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "circuit-tile " + tile.kind;
        button.setAttribute(
            "aria-label",
            "Roteste piesa " + (index + 1)
        );

        const pipe = document.createElement("span");
        pipe.className = "pipe";
        pipe.textContent = tile.kind === "straight" ? "│" : "└";
        pipe.style.transform =
            "rotate(" + (tile.rotation * 90) + "deg)";

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

function renderVictory(state) {
    const panel = document.createElement("div");
    panel.className = "victory";

    const icon = document.createElement("div");
    icon.className = "victory-icon";
    icon.textContent = "🚀";

    const title = document.createElement("h3");
    title.textContent = "MISIUNE REUSITA!";

    const description = document.createElement("p");
    description.textContent =
        "Ai terminat misiunea! Dificultate: " +
        state.difficulty +
        ". Greseli: " +
        state.mistakes +
        ". Indicii: " +
        state.hints +
        ".";

    panel.appendChild(icon);
    panel.appendChild(title);
    panel.appendChild(description);
    area.appendChild(panel);
}

function render(state) {
    currentState = state;

    document.getElementById("stage-number").textContent =
        state.stage === 7 ? "6 / 6" : state.stage + " / 6";

    document.getElementById("difficulty").textContent =
        state.difficulty;

    document.getElementById("mistakes").textContent =
        state.mistakes;

    document.getElementById("hints").textContent =
        state.hints;

    document.getElementById("stage-name").textContent =
        state.stage_name;

    document.getElementById("stage-label").textContent =
        state.stage === 7
            ? "MISSION COMPLETE"
            : "STAGE " + String(state.stage).padStart(2, "0");

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

async function refreshState() {
    if (loading || busy) return;

    loading = true;

    try {
        const state = await getState();
        render(state);
    } catch (error) {
        console.error("Eroare la incarcarea jocului:", error);
        feedback.textContent =
            "Nu s-a putut incarca misiunea. Reincarca pagina.";
    } finally {
        loading = false;
    }
}

document.getElementById("hint-button").addEventListener("click", () => {
    sendAction({ type: "hint" });
});

document.getElementById("restart-button").addEventListener("click", async () => {
    if (!confirm("Vrei sa reincepi misiunea de la prima etapa?")) {
        return;
    }

    if (busy) return;
    busy = true;

    try {
        const response = await fetch("/restart", {
            method: "POST",
            credentials: "same-origin"
        });

        if (!response.ok) {
            throw new Error("Nu s-a putut reincepe jocul.");
        }

        const state = await response.json();
        render(state);
    } catch (error) {
        console.error("Eroare la restart:", error);
        feedback.textContent =
            "Nu s-a putut reincepe jocul. Incearca din nou.";
    } finally {
        busy = false;
    }
});

refreshState();
setInterval(refreshState, 1000);
