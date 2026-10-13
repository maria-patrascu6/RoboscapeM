
const $ = (id) => document.getElementById(id);

let currentState = null;
let wireOrder = [];
let wireStageKey = null;
let draggedWire = null;

// Exact aceleași 6 forme ca în main.py.
const SYMBOLS = ["▲", "●", "■", "◆", "★", "⬟"];

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
        draggedWire = null;
    }

    $("player-label").textContent = state.player_name || "Explorator";
    $("stage-label").textContent = state.stage <= 6
        ? `Etapa ${state.stage} din 6`
        : "Misiune completă";

    $("stage-number").textContent = state.stage <= 6
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

    const progress = Math.min(
        100,
        Math.round(Math.min(state.stage, 6) / 6 * 100)
    );

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

    if (state.status !== "playing") return;

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
            } else {
                button.classList.add("open-cell");
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
        } else {
            button.textContent = safe ? "•" : "×";
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

    [
        { text: "↑", dx: 0, dy: -1 },
        { text: "←", dx: -1, dy: 0 },
        { text: "↓", dx: 0, dy: 1 },
        { text: "→", dx: 1, dy: 0 },
    ].forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "direction-button";
        button.textContent = item.text;

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

    const bomb = document.createElement("div");
    bomb.className = "bomb-icon";
    bomb.textContent = "💣";
    bomb.setAttribute("aria-label", "Bombă reactor");
    wrapper.appendChild(bomb);

    if (state.bomb_phase === "show") {
        const label = document.createElement("p");
        label.className = "memory-label";
        label.textContent =
            "Memorează secvența de simboluri înainte să dispară:";
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
        note.textContent =
            "Reține formele și ordinea lor pentru a dezamorsa bomba.";
        wrapper.appendChild(note);
    } else {
        const label = document.createElement("p");
        label.className = "memory-label";
        label.textContent =
            "Alege simbolurile în ordinea în care le-ai văzut:";
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

/*
 * CABLURI CU DRAG-AND-DROP
 * Ordinea corectă este Roșu, Albastru, Galben, Verde.
 * Poți trage orice cablu pe poziția altui cablu.
 */
function renderWires(state, area) {
    const wrapper = document.createElement("div");
    wrapper.className = "wires-wrapper";

    const instruction = document.createElement("p");
    instruction.className = "memory-label";
    instruction.textContent =
        "Glisează cablurile în ordinea corectă, de la 1 la 4.";
    wrapper.appendChild(instruction);

    const list = document.createElement("div");
    list.className = "wire-list";

    const colors = state.wire_colors || [
        "Roșu", "Albastru", "Galben", "Verde"
    ];

    const colorClasses = ["red", "blue", "yellow", "green"];

    // Indicii pozițiilor, nu pozițiile inițiale ale culorilor.
    wireOrder.forEach((wireIndex, position) => {
        const slot = document.createElement("div");
        slot.className = "wire-slot";
        slot.dataset.position = String(position);

        const number = document.createElement("span");
        number.className = "wire-number";
        number.textContent = String(position + 1);

        const button = document.createElement("button");
        button.type = "button";
        button.className = "wire-item";
        button.draggable = true;
        button.dataset.wireIndex = String(wireIndex);
        button.setAttribute(
            "aria-label",
            `Trage cablul ${colors[wireIndex]}`
        );

        const line = document.createElement("span");
        line.className = `wire-line ${colorClasses[wireIndex]}`;

        const label = document.createElement("span");
        label.className = "wire-name";
        label.textContent = colors[wireIndex];

        const grip = document.createElement("span");
        grip.className = "wire-grip";
        grip.textContent = "⠿";
        grip.setAttribute("aria-hidden", "true");

        button.append(line, label, grip);
        slot.append(number, button);
        list.appendChild(slot);

        button.addEventListener("dragstart", (event) => {
            draggedWire = position;
            slot.classList.add("wire-dragging");

            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(
                    "text/plain",
                    String(position)
                );
            }
        });

        button.addEventListener("dragend", () => {
            draggedWire = null;
            list.querySelectorAll(".wire-slot").forEach((element) => {
                element.classList.remove(
                    "wire-dragging",
                    "wire-drop-target"
                );
            });
        });

        slot.addEventListener("dragover", (event) => {
            event.preventDefault();
            slot.classList.add("wire-drop-target");

            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "move";
            }
        });

        slot.addEventListener("dragleave", (event) => {
            if (!slot.contains(event.relatedTarget)) {
                slot.classList.remove("wire-drop-target");
            }
        });

        slot.addEventListener("drop", (event) => {
            event.preventDefault();
            slot.classList.remove("wire-drop-target");

            let from = draggedWire;

            if (event.dataTransfer) {
                const transferred = event.dataTransfer.getData("text/plain");

                if (transferred !== "") {
                    from = Number(transferred);
                }
            }

            const to = position;

            if (
                from === null ||
                !Number.isInteger(from) ||
                from < 0 ||
                from >= wireOrder.length ||
                from === to
            ) {
                return;
            }

            const updated = wireOrder.slice();
            const moved = updated.splice(from, 1)[0];
            updated.splice(to, 0, moved);
            wireOrder = updated;
            draggedWire = null;

            checkWireOrder();
        });

        // Compatibilitate pentru dispozitive cu ecran tactil:
        // butoanele sus/jos pot fi folosite și fără drag-and-drop.
        const moveControls = document.createElement("div");
        moveControls.className = "wire-move-controls";

        const up = document.createElement("button");
        up.type = "button";
        up.className = "wire-move-button";
        up.textContent = "↑";
        up.disabled = position === 0;
        up.setAttribute("aria-label", "Mută cablul în sus");
        up.addEventListener("click", () => moveWire(position, position - 1));

        const down = document.createElement("button");
        down.type = "button";
        down.className = "wire-move-button";
        down.textContent = "↓";
        down.disabled = position === wireOrder.length - 1;
        down.setAttribute("aria-label", "Mută cablul în jos");
        down.addEventListener("click", () => moveWire(position, position + 1));

        moveControls.append(up, down);
        slot.appendChild(moveControls);
    });

    wrapper.appendChild(list);
    area.appendChild(wrapper);
}

function moveWire(from, to) {
    if (
        from < 0 ||
        to < 0 ||
        from >= wireOrder.length ||
        to >= wireOrder.length
    ) {
        return;
    }

    const updated = wireOrder.slice();
    const moved = updated.splice(from, 1)[0];
    updated.splice(to, 0, moved);
    wireOrder = updated;

    checkWireOrder();
}

function checkWireOrder() {
    if (wireOrder.every((value, index) => value === index)) {
        // Ordinea este corectă: trecem la etapa următoare.
        sendAction("wire_solved");
        return;
    }

    // Trimitem greșeala serverului, dar păstrăm ordinea nouă
    // pe ecran ca jucătorul să poată continua să mute cablurile.
    sendAction("wire_wrong");
    renderWires(currentState, $("game-content"));
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

    form.append(input, button);

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        sendAction("logic_submit", { answer: input.value });
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
        "Apasă pe piese pentru a le roti cu 90° și a conecta circuitul.";
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

            item.append(name, score);
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
