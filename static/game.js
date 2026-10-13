
const $ = (id) => document.getElementById(id);

let currentState = null;
let wireOrder = [];
let wireStageKey = null;
let selectedWire = null;

const SYMBOLS = ["▲", "●", "■", "◆", "★", "⬟", "✚", "⬢"];

async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "A apărut o eroare.");
    }

    return data;
}

async function sendAction(type, extra = {}) {
    try {
        const data = await api("/action", {
            method: "POST",
            body: JSON.stringify({ type, ...extra }),
        });

        if (data.needs_name) {
            showNameScreen();
            return;
        }

        renderState(data);
    } catch (error) {
        showError(error.message);
    }
}

function showError(message) {
    $("feedback").textContent = message;
    $("feedback").classList.add("error-feedback");
}

function showNameScreen() {
    $("player-screen").classList.remove("hidden");
    $("game-screen").classList.add("hidden");
    $("name-error").textContent = "";
    currentState = null;
    wireStageKey = null;
    wireOrder = [];
}

function showGameScreen() {
    $("player-screen").classList.add("hidden");
    $("game-screen").classList.remove("hidden");
}

function renderState(state) {
    currentState = state;

    if (state.needs_name) {
        showNameScreen();
        return;
    }

    showGameScreen();

    if (wireStageKey !== state.stage) {
        wireStageKey = state.stage;
        wireOrder = (state.wire_target || []).slice();
        selectedWire = null;
    }

    $("player-label").textContent = state.player_name || "Explorator";
    $("stage-label").textContent =
        state.stage <= 6
            ? `Etapa ${state.stage} din 6`
            : "Misiune completă";

    $("stage-number").textContent =
        state.stage <= 6
            ? String(state.stage).padStart(2, "0")
            : "✓";

    $("challenge-title").textContent =
        state.stage_name || "Misiune completă";

    $("challenge-description").textContent =
        state.stage_description || "";

    $("difficulty-label").textContent = {
        easy: "Ușor",
        normal: "Normal",
        hard: "Dificil",
    }[state.difficulty] || "Normal";

    $("mistakes-stat").textContent = state.mistakes;
    $("hints-stat").textContent = state.hints;
    $("successes-stat").textContent = state.successes;

    const progress = Math.min(100, Math.round(
        Math.min(state.stage, 6) / 6 * 100
    ));

    $("progress-fill").style.width = `${progress}%`;
    $("progress-text").textContent = `${progress}%`;

    $("feedback").textContent = state.feedback || "";
    $("feedback").classList.remove("error-feedback");

    $("hint-btn").disabled = state.status !== "playing";
    $("hint-btn").style.display =
        state.status === "playing" ? "inline-flex" : "none";

    renderChallenge(state);

    if (state.status === "won") {
        $("challenge-title").textContent = "Ai evadat!";
        $("challenge-description").textContent =
            "Ai terminat toate cele șase provocări.";
        $("game-content").innerHTML = `
            <div class="victory">
                <div class="victory-icon">🚀</div>
                <h3>Misiune îndeplinită!</h3>
                <p>Felicitări, exploratorule!</p>
                <p>Greșeli: ${Number(state.mistakes) || 0}</p>
                <button class="primary-button" id="next-player-btn">
                    Următorul jucător →
                </button>
            </div>
        `;

        $("next-player-btn").addEventListener("click", () => {
            sendAction("restart");
        });
    }

    loadLeaderboard();
}

function renderChallenge(state) {
    const area = $("game-content");
    area.innerHTML = "";

    if (state.status !== "playing") {
        return;
    }

    switch (state.stage) {
        case 1:
            renderMaze(state, area);
            break;
        case 2:
            renderMemory(state, area);
            break;
        case 3:
            renderWires(state, area);
            break;
        case 4:
            renderSecurityGrid(state, area);
            break;
        case 5:
            renderLogic(state, area);
            break;
        case 6:
            renderCircuit(state, area);
            break;
        default:
            area.textContent = "Etapă necunoscută.";
    }
}

function renderMaze(state, area) {
    const wrapper = document.createElement("div");
    wrapper.className = "maze-wrapper";

    const board = document.createElement("div");
    board.className = "board maze-board";

    const player = state.maze_player || [0, 0];

    state.maze.forEach((row, r) => {
        row.forEach((cell, c) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "board-cell";

            if (cell === 1) {
                button.classList.add("wall");
                button.disabled = true;
                button.setAttribute("aria-label", "Perete");
            } else {
                button.classList.add("open-cell");
                button.setAttribute("aria-label", `Celula ${r + 1}, ${c + 1}`);
            }

            if (player[0] === r && player[1] === c) {
                button.textContent = "🤖";
                button.classList.add("player-cell");
            } else if (r === 4 && c === 4) {
                button.textContent = "🚪";
                button.classList.add("exit-cell");
            }

            board.appendChild(button);
        });
    });

    wrapper.appendChild(board);
    wrapper.appendChild(makeControls("maze_move"));
    area.appendChild(wrapper);
}

function renderSecurityGrid(state, area) {
    const wrapper = document.createElement("div");
    wrapper.className = "maze-wrapper";

    const board = document.createElement("div");
    board.className = "board security-board";

    const player = Number(state.grid_player) || 0;

    state.grid.forEach((safe, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "board-cell security-cell";
        button.classList.add(safe ? "safe-cell" : "unsafe-cell");

        if (index === player) {
            button.textContent = "🤖";
            button.classList.add("player-cell");
        } else if (index === 24) {
            button.textContent = "🚪";
        } else if (safe) {
            button.textContent = "•";
        } else {
            button.textContent = "×";
        }

        board.appendChild(button);
    });

    wrapper.appendChild(board);
    wrapper.appendChild(makeControls("grid_move"));
    area.appendChild(wrapper);
}

function makeControls(actionType) {
    const controls = document.createElement("div");
    controls.className = "direction-controls";

    const layout = [
        { text: "↑", dx: 0, dy: -1, label: "Sus" },
        { text: "←", dx: -1, dy: 0, label: "Stânga" },
        { text: "↓", dx: 0, dy: 1, label: "Jos" },
        { text: "→", dx: 1, dy: 0, label: "Dreapta" },
    ];

    layout.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "direction-button";
        button.textContent = item.text;
        button.setAttribute("aria-label", item.label);
        button.addEventListener("click", () => {
            sendAction(actionType, {
                dx: item.dx,
                dy: item.dy,
            });
        });
        controls.appendChild(button);
    });

    return controls;
}

function renderMemory(state, area) {
    const wrapper = document.createElement("div");
    wrapper.className = "memory-wrapper";

    if (state.bomb_phase === "show") {
        const label = document.createElement("p");
        label.className = "memory-label";
        label.textContent = "Memorează ordinea simbolurilor:";
        wrapper.appendChild(label);

        const sequence = document.createElement("div");
        sequence.className = "symbol-sequence";

        (state.bomb_sequence || []).forEach((symbol) => {
            const item = document.createElement("span");
            item.className = "sequence-symbol";
            item.textContent = symbol;
            sequence.appendChild(item);
        });

        wrapper.appendChild(sequence);

        const note = document.createElement("p");
        note.className = "muted-note";
        note.textContent = "Simbolurile vor dispărea în câteva secunde.";
        wrapper.appendChild(note);
    } else {
        const label = document.createElement("p");
        label.className = "memory-label";
        label.textContent = "Reproduce șirul, de la stânga la dreapta:";
        wrapper.appendChild(label);

        const progress = document.createElement("p");
        progress.className = "memory-progress";
        progress.textContent =
            `${state.bomb_index} / ${state.bomb_length}`;
        wrapper.appendChild(progress);

        const grid = document.createElement("div");
        grid.className = "symbol-grid";

        SYMBOLS.forEach((symbol) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "symbol-button";
            button.textContent = symbol;
            button.addEventListener("click", () => {
                sendAction("bomb_pick", { symbol });
            });
            grid.appendChild(button);
        });

        wrapper.appendChild(grid);
    }

    area.appendChild(wrapper);
}

function renderWires(state, area) {
    const wrapper = document.createElement("div");
    wrapper.className = "wires-wrapper";

    const instruction = document.createElement("p");
    instruction.className = "memory-label";
    instruction.textContent =
        "Selectează două cabluri pentru a le schimba pozițiile.";
    wrapper.appendChild(instruction);

    const list = document.createElement("div");
    list.className = "wire-list";

    const colors = state.wire_colors || [
        "Roșu", "Albastru", "Galben", "Verde"
    ];

    const colorClasses = ["red", "blue", "yellow", "green"];

    wireOrder.forEach((wireIndex, position) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "wire-item";

        if (selectedWire === position) {
            button.classList.add("wire-selected");
        }

        const line = document.createElement("span");
        line.className = `wire-line ${colorClasses[wireIndex] || "red"}`;

        const label = document.createElement("span");
        label.textContent = `${position + 1}. ${colors[wireIndex]}`;

        button.appendChild(line);
        button.appendChild(label);

        button.addEventListener("click", () => {
            if (selectedWire === null) {
                selectedWire = position;
                renderWires(currentState, $("game-content"));
                return;
            }

            if (selectedWire === position) {
                selectedWire = null;
                renderWires(currentState, $("game-content"));
                return;
            }

            const temp = wireOrder[selectedWire];
            wireOrder[selectedWire] = wireOrder[position];
            wireOrder[position] = temp;
            selectedWire = null;

            if (wireOrder.every((value, index) => value === index)) {
                sendAction("wire_solved");
            } else {
                sendAction("wire_wrong");
            }
        });

        list.appendChild(button);
    });

    wrapper.appendChild(list);
    area.appendChild(wrapper);
}

function renderLogic(state, area) {
    const wrapper = document.createElement("div");
    wrapper.className = "logic-wrapper";

    const question = document.createElement("p");
    question.className = "logic-question";
    question.textContent = state.logic_question || "Rezolvă problema.";
    wrapper.appendChild(question);

    const form = document.createElement("form");
    form.className = "logic-form";

    const input = document.createElement("input");
    input.type = "number";
    input.id = "logic-answer";
    input.placeholder = "Răspunsul tău";
    input.required = true;
    input.setAttribute("aria-label", "Răspuns numeric");

    const button = document.createElement("button");
    button.type = "submit";
    button.className = "primary-button";
    button.textContent = "Verifică răspunsul";

    form.appendChild(input);
    form.appendChild(button);

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        sendAction("logic_submit", {
            answer: input.value,
        });
    });

    wrapper.appendChild(form);
    area.appendChild(wrapper);
}

function renderCircuit(state, area) {
    const wrapper = document.createElement("div");
    wrapper.className = "circuit-wrapper";

    const note = document.createElement("p");
    note.className = "muted-note";
    note.textContent =
        "Apasă pe fiecare piesă pentru a o roti cu 90°.";
    wrapper.appendChild(note);

    const board = document.createElement("div");
    board.className = "circuit-board";

    (state.circuit || []).forEach((tile, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `circuit-tile ${tile.kind}`;
        button.setAttribute("aria-label", `Rotește piesa ${index + 1}`);

        const symbol = document.createElement("span");
        symbol.className = "circuit-symbol";
        symbol.style.transform = `rotate(${tile.rotation * 90}deg)`;
        symbol.textContent = tile.kind === "elbow" ? "└" : "━";

        button.appendChild(symbol);
        button.addEventListener("click", () => {
            sendAction("circuit_rotate", { index });
        });

        board.appendChild(button);
    });

    wrapper.appendChild(board);
    area.appendChild(wrapper);
}

async function loadLeaderboard() {
    try {
        const rows = await api("/leaderboard");
        const list = $("leaderboard-list");
        list.innerHTML = "";

        if (!rows.length) {
            const item = document.createElement("li");
            item.textContent = "Încă nu există rezultate.";
            list.appendChild(item);
            return;
        }

        rows.forEach((row) => {
            const item = document.createElement("li");
            const name = document.createElement("span");
            const score = document.createElement("strong");

            name.textContent = row.name;
            score.textContent =
                `${row.completed}/6 · ${row.mistakes} greșeli`;

            item.appendChild(name);
            item.appendChild(score);
            list.appendChild(item);
        });
    } catch {
        $("leaderboard-list").textContent =
            "Clasamentul nu este disponibil momentan.";
    }
}

async function loadMLStatus() {
    try {
        const result = await api("/ml-status");
        $("ml-status").textContent = result.message;
    } catch {
        $("ml-status").textContent =
            "Starea modelului nu este disponibilă momentan.";
    }
}

$("player-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = $("player-name").value.trim();

    if (!name) {
        $("name-error").textContent = "Introdu un nume.";
        return;
    }

    $("name-error").textContent = "";

    try {
        const state = await api("/start", {
            method: "POST",
            body: JSON.stringify({ name }),
        });

        renderState(state);
        loadMLStatus();
    } catch (error) {
        $("name-error").textContent = error.message;
    }
});

$("hint-btn").addEventListener("click", () => {
    sendAction("hint");
});

$("restart-btn").addEventListener("click", () => {
    sendAction("restart");
});

async function refreshState() {
    if (
        !currentState ||
        currentState.stage !== 2 ||
        currentState.status !== "playing"
    ) {
        return;
    }

    try {
        const state = await api("/state");

        if (state.needs_name) {
            showNameScreen();
        } else {
            renderState(state);
        }
    } catch {
        // O eroare temporară de rețea nu oprește jocul.
    }
}

async function initialize() {
    try {
        const state = await api("/state");

        if (state.needs_name) {
            showNameScreen();
        } else {
            renderState(state);
        }
    } catch {
        showNameScreen();
    }

    loadLeaderboard();
    loadMLStatus();
}

setInterval(refreshState, 500);
initialize();
