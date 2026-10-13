
const $ = (id) => document.getElementById(id);

const WIRE_COLORS = [
    "#ff647c",
    "#65a9ff",
    "#ffd166",
    "#65e6a6"
];

let currentState = null;
let currentStage = null;
let wireOrder = [0, 1, 2, 3];
let draggedWire = null;

async function api(url, method = "GET", data = null) {
    const options = { method };

    if (data !== null) {
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.error || "A apărut o eroare.");
    }

    return result;
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function showNameScreen() {
    $("name-screen").classList.remove("hidden");
    $("game-screen").classList.add("hidden");
}

function showGameScreen() {
    $("name-screen").classList.add("hidden");
    $("game-screen").classList.remove("hidden");
}

async function startGame(name) {
    try {
        $("start-error").textContent = "";

        const state = await api("/start", "POST", { name });
        currentStage = null;
        renderState(state);
        showGameScreen();

        await loadLeaderboard();
        await loadMLStatus();
    } catch (error) {
        $("start-error").textContent = error.message;
    }
}

async function sendAction(type, value = null) {
    try {
        const data = { type };

        if (value !== null) {
            data.value = value;
        }

        const state = await api("/action", "POST", data);

        if (state.needs_name) {
            showNameScreen();
            return;
        }

        renderState(state);

        if (state.status === "won") {
            await loadLeaderboard();
        }
    } catch (error) {
        $("feedback").textContent = error.message;
    }
}

function renderState(state) {
    if (state.needs_name) {
        showNameScreen();
        return;
    }

    if (state.stage === 3 && currentStage !== 3) {
        wireOrder = [0, 1, 2, 3];
    }

    currentStage = state.stage;
    currentState = state;

    showGameScreen();

    $("player-label").textContent = state.player_name || "Jucător";
    $("stage-title").textContent = state.status === "won"
        ? "Misiune reușită!"
        : state.stage_name;

    $("stage-description").textContent = state.status === "won"
        ? "Ai parcurs toate cele șase etape ale RoboScape."
        : state.stage_description;

    $("feedback").textContent = state.feedback || "";

    $("success-count").textContent = state.successes;
    $("mistake-count").textContent = state.mistakes;
    $("hint-count").textContent = state.hints;

    const difficultyNames = {
        easy: "Ușor",
        normal: "Normal",
        hard: "Dificil"
    };

    $("difficulty-label").textContent =
        difficultyNames[state.difficulty] || state.difficulty;

    const progress = state.status === "won"
        ? 100
        : Math.min(100, (state.stage - 1) / 6 * 100);

    $("progress-bar").style.width = `${progress}%`;
    $("progress-label").textContent = state.status === "won"
        ? "6 din 6 etape finalizate"
        : `Etapa ${state.stage} din 6`;

    if (state.hint) {
        $("hint-box").textContent = state.hint;
        $("hint-box").classList.remove("hidden");
    } else {
        $("hint-box").textContent = "";
        $("hint-box").classList.add("hidden");
    }

    renderChallenge(state);
}

function renderChallenge(state) {
    const container = $("game-content");

    if (state.status === "won") {
        container.innerHTML = `
            <div class="victory">
                <div class="victory-icon">🏆</div>
                <h2 class="challenge-title">Ai evadat!</h2>
                <p class="challenge-description">
                    Felicitări, ${escapeHTML(state.player_name)}!
                    Ai finalizat toate cele șase provocări.
                </p>
                <p>Etape completate: <strong>${state.successes}</strong></p>
                <p>Greșeli: <strong>${state.mistakes}</strong></p>
                <button id="play-again" class="primary-button" type="button">
                    Joacă din nou ↻
                </button>
            </div>
        `;

        $("play-again").addEventListener("click", () => sendAction("restart"));
        return;
    }

    switch (state.stage) {
        case 1:
            renderMaze(state, container);
            break;
        case 2:
            renderMemory(state, container);
            break;
        case 3:
            renderWires(state, container);
            break;
        case 4:
            renderSecurityGrid(state, container);
            break;
        case 5:
            renderLogic(container);
            break;
        case 6:
            renderCircuit(state, container);
            break;
        default:
            container.innerHTML = "<p>Misiune terminată.</p>";
    }
}

function renderMaze(state, container) {
    const player = state.maze_player;

    let html = `
        <h2 class="challenge-title">Găsește ieșirea</h2>
        <p class="challenge-description">
            Folosește săgețile pentru a ajunge la ieșire.
            Pătratele întunecate sunt ziduri.
        </p>
        <div class="board">
    `;

    state.maze.forEach((row, rowIndex) => {
        row.forEach((cell, colIndex) => {
            const index = rowIndex * 5 + colIndex;
            let classes = "board-cell";
            let content = "";

            if (cell === 1) {
                classes += " wall";
            }

            if (index === player) {
                classes += " player";
                content = "🤖";
            } else if (index === 24) {
                classes += " exit";
                content = "🚪";
            }

            html += `<div class="${classes}">${content}</div>`;
        });
    });

    html += `
        </div>
        <div class="direction-controls">
            <button class="empty-control" tabindex="-1" aria-hidden="true"> </button>
            <button data-move="up" aria-label="Sus">↑</button>
            <button class="empty-control" tabindex="-1" aria-hidden="true"> </button>
            <button data-move="left" aria-label="Stânga">←</button>
            <button data-move="down" aria-label="Jos">↓</button>
            <button data-move="right" aria-label="Dreapta">→</button>
        </div>
    `;

    container.innerHTML = html;

    container.querySelectorAll("[data-move]").forEach((button) => {
        button.addEventListener("click", () => {
            sendAction("maze_move", button.dataset.move);
        });
    });
}

function renderMemory(state, container) {
    const symbols = state.symbols || ["▲", "●", "■", "◆", "★", "⬟"];

    let sequenceHTML = "";

    if (state.bomb_phase === "show") {
        sequenceHTML = (state.bomb_sequence || [])
            .map((symbol) => `<span class="sequence-symbol">${symbol}</span>`)
            .join("");
    } else {
        sequenceHTML = `
            <span class="sequence-symbol">?</span>
            <span class="sequence-symbol">?</span>
            <span class="sequence-symbol">?</span>
        `;
    }

    let html = `
        <div class="bomb-icon">💣</div>
        <h2 class="challenge-title">Dezamorsează reactorul</h2>
        <p class="challenge-description">
            ${
                state.bomb_phase === "show"
                ? "Memorează formele în ordinea afișată!"
                : "Apasă formele în aceeași ordine în care au apărut."
            }
        </p>
        <div class="sequence-display">${sequenceHTML}</div>
    `;

    if (state.bomb_phase === "input") {
        html += `
            <p class="challenge-description" style="text-align:center">
                Forma ${state.bomb_index + 1} din ${state.bomb_length}
            </p>
            <div class="symbol-grid">
                ${symbols.map((symbol) => `
                    <button class="symbol-button" type="button"
                        data-symbol="${symbol}">${symbol}</button>
                `).join("")}
            </div>
        `;
    } else {
        html += `
            <p class="challenge-description" style="text-align:center">
                Pregătește-te...
            </p>
        `;
    }

    container.innerHTML = html;

    container.querySelectorAll("[data-symbol]").forEach((button) => {
        button.addEventListener("click", () => {
            sendAction("bomb_pick", button.dataset.symbol);
        });
    });
}

function renderWires(state, container) {
    const colors = state.wire_colors;
    const target = state.wire_target;

    const targetHTML = target.map((wireId) => `
        <span class="target-color">
            ${colors[wireId]}
        </span>
    `).join("");

    const slotsHTML = wireOrder.map((wireId, index) => `
        <div class="wire-slot" data-slot="${index}">
            <span class="wire-number">${index + 1}</span>

            <div class="wire-item" draggable="true" data-wire="${wireId}">
                <span class="wire-line"
                    style="background:${WIRE_COLORS[wireId]}"></span>
                <span class="wire-name">${colors[wireId]}</span>
                <span class="wire-grip">⠿</span>
            </div>

            <div class="wire-move-controls">
                <button class="wire-move-button" type="button"
                    data-shift="${index}" data-direction="-1"
                    ${index === 0 ? "disabled" : ""}
                    aria-label="Mută în sus">↑</button>
                <button class="wire-move-button" type="button"
                    data-shift="${index}" data-direction="1"
                    ${index === wireOrder.length - 1 ? "disabled" : ""}
                    aria-label="Mută în jos">↓</button>
            </div>
        </div>
    `).join("");

    container.innerHTML = `
        <h2 class="challenge-title">Reconectează cablurile</h2>
        <p class="challenge-description">
            Glisează cablurile în ordinea afișată mai jos.
            Pe telefon, poți folosi și săgețile de lângă fiecare cablu.
        </p>

        <div class="wire-order-target">${targetHTML}</div>
        <div class="wire-list">${slotsHTML}</div>

        <button id="check-wires" class="primary-button submit-button" type="button">
            Verifică ordinea
        </button>
    `;

    container.querySelectorAll(".wire-item").forEach((item) => {
        item.addEventListener("dragstart", (event) => {
            draggedWire = Number(item.dataset.wire);
            event.dataTransfer.setData("text/plain", String(draggedWire));
            event.dataTransfer.effectAllowed = "move";
        });

        item.addEventListener("dragend", () => {
            draggedWire = null;
            container.querySelectorAll(".wire-slot").forEach((slot) => {
                slot.classList.remove("wire-drop-target");
            });
        });
    });

    container.querySelectorAll(".wire-slot").forEach((slot) => {
        slot.addEventListener("dragover", (event) => {
            event.preventDefault();
            slot.classList.add("wire-drop-target");
        });

        slot.addEventListener("dragleave", () => {
            slot.classList.remove("wire-drop-target");
        });

        slot.addEventListener("drop", (event) => {
            event.preventDefault();
            slot.classList.remove("wire-drop-target");

            const wireId = Number(event.dataTransfer.getData("text/plain"));
            const targetIndex = Number(slot.dataset.slot);
            moveWire(wireId, targetIndex);
        });
    });

    container.querySelectorAll("[data-shift]").forEach((button) => {
        button.addEventListener("click", () => {
            const from = Number(button.dataset.shift);
            const direction = Number(button.dataset.direction);
            const to = from + direction;

            if (to < 0 || to >= wireOrder.length) return;

            [wireOrder[from], wireOrder[to]] =
                [wireOrder[to], wireOrder[from]];

            renderWires(currentState, container);
        });
    });

    $("check-wires").addEventListener("click", () => {
        sendAction("wire_submit", wireOrder);
    });
}

function moveWire(wireId, targetIndex) {
    const oldIndex = wireOrder.indexOf(wireId);

    if (oldIndex < 0 || targetIndex < 0 || targetIndex >= wireOrder.length) {
        return;
    }

    wireOrder.splice(oldIndex, 1);
    wireOrder.splice(targetIndex, 0, wireId);

    renderWires(currentState, $("game-content"));
}

function renderSecurityGrid(state, container) {
    const safeCells = state.safe_path;
    const player = state.grid_player;

    let html = `
        <h2 class="challenge-title">Grila de securitate</h2>
        <p class="challenge-description">
            Ajungi la ieșire deplasându-te pe traseul sigur.
            Folosește săgețile; celulele sigure sunt evidențiate.
        </p>
        <div class="board">
    `;

    for (let index = 0; index < 25; index++) {
        let classes = "board-cell";
        let content = "";

        if (safeCells.includes(index)) {
            classes += " safe";
        }

        if (index === player) {
            classes += " player";
            content = "🤖";
        } else if (index === 24) {
            classes += " exit";
            content = "🚪";
        }

        html += `<div class="${classes}">${content}</div>`;
    }

    html += `
        </div>
        <div class="direction-controls">
            <button class="empty-control" tabindex="-1" aria-hidden="true"> </button>
            <button data-grid-move="up" aria-label="Sus">↑</button>
            <button class="empty-control" tabindex="-1" aria-hidden="true"> </button>
            <button data-grid-move="left" aria-label="Stânga">←</button>
            <button data-grid-move="down" aria-label="Jos">↓</button>
            <button data-grid-move="right" aria-label="Dreapta">→</button>
        </div>
    `;

    container.innerHTML = html;

    container.querySelectorAll("[data-grid-move]").forEach((button) => {
        button.addEventListener("click", () => {
            sendAction("grid_move", button.dataset.gridMove);
        });
    });
}

function renderLogic(container) {
    container.innerHTML = `
        <h2 class="challenge-title">Codul logic</h2>
        <p class="challenge-description">
            Identifică regula șirului și introdu următorul număr.
        </p>

        <div class="logic-question">2, 3, 5, 8, 12, ?</div>

        <form id="logic-form" class="logic-form">
            <input id="logic-answer" type="number"
                placeholder="Răspunsul tău" required>
            <button class="primary-button" type="submit">Verifică</button>
        </form>
    `;

    $("logic-form").addEventListener("submit", (event) => {
        event.preventDefault();
        sendAction("logic_submit", $("logic-answer").value);
    });
}

function renderCircuit(state, container) {
    const arrows = ["↑", "→", "↓", "←"];

    container.innerHTML = `
        <h2 class="challenge-title">Continuitatea circuitului</h2>
        <p class="challenge-description">
            Rotește fiecare piesă apăsând pe ea.
            Aliniază toate săgețile cu orientarea corectă pentru a închide circuitul.
        </p>

        <div class="circuit-grid">
            ${state.circuit_rotations.map((rotation, index) => `
                <button class="circuit-tile" type="button"
                    data-circuit="${index}"
                    aria-label="Rotește piesa ${index + 1}">
                    ${arrows[rotation]}
                </button>
            `).join("")}
        </div>
    `;

    container.querySelectorAll("[data-circuit]").forEach((button) => {
        button.addEventListener("click", () => {
            sendAction("circuit_rotate", Number(button.dataset.circuit));
        });
    });
}

async function loadLeaderboard() {
    try {
        const results = await api("/leaderboard");
        const list = $("leaderboard-list");

        if (!results.length) {
            list.innerHTML = "<li>Nu există încă misiuni finalizate.</li>";
            return;
        }

        list.innerHTML = results.map((item) => `
            <li>
                <div class="leaderboard-entry">
                    <strong>${escapeHTML(item.name)}</strong>
                    <span>${item.mistakes} greșeli</span>
                </div>
            </li>
        `).join("");
    } catch (error) {
        $("leaderboard-list").innerHTML =
            "<li>Clasamentul nu este disponibil momentan.</li>";
    }
}

async function loadMLStatus() {
    try {
        const result = await api("/ml-status");
        $("ml-message").textContent = result.message || "Model adaptiv disponibil.";
    } catch (error) {
        $("ml-message").textContent = "Statusul modelului nu este disponibil.";
    }
}

$("player-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("player-name").value.trim();

    if (name) {
        startGame(name);
    }
});

$("hint-btn").addEventListener("click", () => sendAction("hint"));

$("restart-btn").addEventListener("click", () => {
    const confirmed = window.confirm(
        "Vrei să reîncepi misiunea de la prima etapă?"
    );

    if (confirmed) {
        sendAction("restart");
    }
});

$("refresh-leaderboard").addEventListener("click", loadLeaderboard);

async function initialize() {
    try {
        const state = await api("/state");

        if (state.needs_name) {
            showNameScreen();
            return;
        }

        renderState(state);
        await loadLeaderboard();
        await loadMLStatus();
    } catch (error) {
        showNameScreen();
        $("start-error").textContent =
            "Nu am putut încărca jocul. Reîncarcă pagina.";
    }
}

initialize();

/* Actualizează etapa bombei când timpul de memorare se termină. */
setInterval(async () => {
    if (
        currentState &&
        currentState.stage === 2 &&
        currentState.status === "playing"
    ) {
        try {
            const state = await api("/state");
            if (!state.needs_name) {
                renderState(state);
            }
        } catch (error) {
            // O eroare temporară nu oprește jocul.
        }
    }
}, 500);


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
