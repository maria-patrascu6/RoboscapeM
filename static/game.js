
const area = document.getElementById("game-area");
const feedback = document.getElementById("feedback");

let currentState = null;
let busy = false;
let loading = false;

const wireColors = [
    "#64b5ff",
    "#ffe16a",
    "#c49bff",
    "#64f0ae",
    "#ff7589"
];

async function getState() {
    const response = await fetch("/state", {
        credentials: "same-origin",
        cache: "no-store"
    });

    if (!response.ok) {
        throw new Error("Eroare server: " + response.status);
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

        const state = await response.json();
        render(state);
    } catch (error) {
        console.error("Eroare la actiune:", error);
        feedback.textContent =
            "Actiunea nu a reusit. Incearca din nou.";
    } finally {
        busy = false;
    }
}

function addDescription(text) {
    const paragraph = document.createElement("p");
    paragraph.className = "game-description";
    paragraph.textContent = text;
    area.appendChild(paragraph);
}

function makeButton(text, className, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", action);
    return button;
}

function renderMaze(state) {
    addDescription(
        "Ghideaza robotul prin labirint si gaseste iesirea."
    );

    const maze = document.createElement("div");
    maze.className = "maze";

    const walls = new Set(
        (state.maze_walls || []).map(position => position.join(","))
    );

    const playerRow = state.maze_pos[0];
    const playerCol = state.maze_pos[1];
    const size = 7;

    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            const cell = document.createElement("div");
            cell.className = "maze-cell";

            if (walls.has(row + "," + col)) {
                cell.classList.add("wall");
                cell.textContent = "■";
            } else if (row === playerRow && col === playerCol) {
                cell.classList.add("player");
                cell.textContent = "🤖";
            } else if (row === size - 1 && col === size - 1) {
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
        { label: "↑", direction: "up" },
        { label: "←", direction: "left" },
        { label: "↓", direction: "down" },
        { label: "→", direction: "right" }
    ];

    directions.forEach(item => {
        controls.appendChild(
            makeButton(item.label, "control-button", () => {
                sendAction({
                    type: actionType,
                    direction: item.direction
                });
            })
        );
    });

    area.appendChild(controls);
}

function renderBomb(state) {
    const showing = state.bomb_phase === "show";

    addDescription(
        showing
            ? "Memoreaza simbolurile afisate in ordinea corecta."
            : "Selecteaza simbolurile in ordinea in care le-ai memorat."
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
            Math.ceil((state.bomb_show_until || 0) - Date.now() / 1000)
        );

        timer.textContent = "MEMOREAZA: " + remaining + " s";
        area.appendChild(timer);
        return;
    }

    const timer = document.createElement("p");
    timer.className = "timer";

    const remaining = Math.max(
        0,
        Math.ceil((state.bomb_deadline || 0) - Date.now() / 1000)
    );

    timer.textContent = "TIMP RAMAS: " + remaining + " s";
    area.appendChild(timer);

    const progress = document.createElement("p");
    progress.textContent =
        "Simboluri selectate: " + (state.bomb_input || []).length;
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
        "Urmareste firele incurcate de la stanga la dreapta. " +
        "Apasa capetele firelor in ordinea terminalelor numerotate."
    );

    const panel = document.createElement("div");
    panel.className = "wire-panel";
    panel.style.cssText =
        "width:100%;max-width:650px;margin:18px auto;padding:16px;" +
        "box-sizing:border-box;background:#080d18;" +
        "border:1px solid #263955;border-radius:16px;";

    const heading = document.createElement("h3");
    heading.textContent = "⚡ PANOU DE CONEXIUNI";
    heading.style.cssText =
        "text-align:center;color:#51e5ff;letter-spacing:2px;" +
        "margin:0 0 14px;";
    panel.appendChild(heading);

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");

    svg.setAttribute("viewBox", "0 0 600 310");
    svg.setAttribute("width", "100%");
    svg.setAttribute("role", "img");
    svg.setAttribute(
        "aria-label",
        "Fire colorate incurcate intre terminalele panoului"
    );

    const colors = state.colors || [
        "Albastru",
        "Galben",
        "Mov",
        "Verde",
        "Rosu"
    ];

    const target = state.wire_target || [];
    const input = state.wire_input || [];
    const connected = new Set(input);

    const rowY = index => 38 + index * 58;

    const slotForColor = {};

    target.forEach((colorIndex, position) => {
        slotForColor[colorIndex] = position;
    });

    let nextSlot = target.length;

    colors.forEach((color, index) => {
        if (slotForColor[index] === undefined) {
            slotForColor[index] = nextSlot;
            nextSlot++;
        }
    });

    // Deseneaza firele cu trasee curbe si intersectii vizibile.
    colors.forEach((color, index) => {
        const startY = rowY(index);
        const endY = rowY(slotForColor[index]);

        const path = document.createElementNS(svgNS, "path");

        const bend1 = 130 + ((index * 97 + 43) % 150);
        const bend2 = 300 + ((index * 71 + 31) % 130);

        path.setAttribute(
            "d",
            "M 88 " + startY +
            " C " + bend1 + " " + (310 - startY) +
            ", " + bend2 + " " + (310 - endY) +
            ", 500 " + endY
        );

        path.setAttribute("fill", "none");
        path.setAttribute("stroke", wireColors[index % wireColors.length]);
        path.setAttribute("stroke-width", connected.has(index) ? "5" : "8");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("opacity", connected.has(index) ? "0.35" : "0.95");

        svg.appendChild(path);
    });

    // Terminalele din stanga sunt interactive.
    colors.forEach((color, index) => {
        const y = rowY(index);
        const isConnected = connected.has(index);

        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", "88");
        circle.setAttribute("cy", String(y));
        circle.setAttribute("r", "13");
        circle.setAttribute("fill", wireColors[index % wireColors.length]);
        circle.setAttribute("stroke", "#ffffff");
        circle.setAttribute("stroke-width", "2");
        circle.style.cursor = isConnected ? "default" : "pointer";
        circle.style.opacity = isConnected ? "0.4" : "1";

        if (!isConnected) {
            circle.addEventListener("click", () => {
                sendAction({
                    type: "wire_pick",
                    color: index
                });
            });
        }

        svg.appendChild(circle);

        const label = document.createElementNS(svgNS, "text");
        label.setAttribute("x", "12");
        label.setAttribute("y", String(y + 4));
        label.setAttribute("fill", "#edf5ff");
        label.setAttribute("font-size", "12");
        label.textContent = color;
        svg.appendChild(label);
    });

    // Terminalele din dreapta sunt numerotate.
    colors.forEach((color, index) => {
        const y = rowY(index);

        const terminal = document.createElementNS(svgNS, "circle");
        terminal.setAttribute("cx", "500");
        terminal.setAttribute("cy", String(y));
        terminal.setAttribute("r", "13");
        terminal.setAttribute("fill", "#101a2b");
        terminal.setAttribute("stroke", "#51e5ff");
        terminal.setAttribute("stroke-width", "3");
        svg.appendChild(terminal);

        const number = document.createElementNS(svgNS, "text");
        number.setAttribute("x", "525");
        number.setAttribute("y", String(y + 5));
        number.setAttribute("fill", "#edf5ff");
        number.setAttribute("font-size", "15");
        number.setAttribute("font-weight", "bold");
        number.textContent = String(index + 1);
        svg.appendChild(number);
    });

    panel.appendChild(svg);
    area.appendChild(panel);

    const progress = document.createElement("p");
    progress.style.cssText =
        "text-align:center;font-weight:700;margin-top:12px;";
    progress.textContent =
        "Conexiuni corecte: " + input.length + " / " + target.length;

    area.appendChild(progress);

    const help = document.createElement("p");
    help.style.cssText =
        "text-align:center;font-size:0.9rem;opacity:0.8;";
    help.textContent =
        "Apasa un terminal colorat din stanga pentru a selecta firul.";
    area.appendChild(help);
}

function renderSecurityGrid(state) {
    addDescription(
        "Ghideaza robotul spre EXIT fara sa atingi peretii."
    );

    const grid = document.createElement("div");
    grid.className = "security-grid";

    const walls = new Set(
        (state.grid_walls || []).map(position => position.join(","))
    );

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
    addDescription(
        "Rezolva sirul numeric si introdu raspunsul in caseta."
    );

    const question = document.createElement("h3");
    question.textContent = state.logic_question || "Care este urmatorul numar?";
    question.style.cssText =
        "font-size:1.4rem;text-align:center;margin:24px 0;";
    area.appendChild(question);

    const form = document.createElement("form");
    form.className = "answer-form";
    form.style.cssText =
        "display:flex;gap:12px;justify-content:center;" +
        "align-items:center;flex-wrap:wrap;margin:20px auto;";

    const input = document.createElement("input");
    input.type = "number";
    input.step = "1";
    input.placeholder = "Scrie raspunsul";
    input.required = true;
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Raspuns numeric");
    input.style.cssText =
        "width:220px;max-width:100%;box-sizing:border-box;" +
        "padding:14px;border-radius:8px;" +
        "border:1px solid #51e5ff;background:#080d18;" +
        "color:#ffffff;font-size:1.1rem;";

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "primary-button";
    submit.textContent = "Verifica raspunsul";

    form.appendChild(input);
    form.appendChild(submit);

    form.addEventListener("submit", async event => {
        event.preventDefault();

        if (input.value.trim() === "") {
            feedback.textContent = "Introdu un raspuns mai intai.";
            input.focus();
            return;
        }

        await sendAction({
            type: "logic_submit",
            answer: input.value
        });
    });

    area.appendChild(form);

    // Permite scrierea imediata in camp.
    input.focus();
}

function renderCircuit(state) {
    addDescription(
        "Roteste piesele pentru a conecta sursa la iesire."
    );

    const legend = document.createElement("p");
    legend.className = "circuit-legend";
    legend.textContent = "⚡ SURSA  →  CIRCUIT  →  CAPSULA";
    area.appendChild(legend);

    const grid = document.createElement("div");
    grid.className = "circuit-grid";

    (state.circuit || []).forEach((tile, index) => {
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
    panel.style.cssText =
        "text-align:center;padding:30px 15px;";

    const icon = document.createElement("div");
    icon.className = "victory-icon";
    icon.textContent = "🚀";
    icon.style.fontSize = "4rem";

    const title = document.createElement("h2");
    title.textContent = "MISIUNE REUSITA!";

    const description = document.createElement("p");
    description.textContent =
        "Ai terminat toate etapele. " +
        "Greseli: " + state.mistakes +
        ". Indicii folosite: " + state.hints + ".";

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
        state.difficulty ?? 1;

    document.getElementById("mistakes").textContent =
        state.mistakes ?? 0;

    document.getElementById("hints").textContent =
        state.hints ?? 0;

    document.getElementById("stage-name").textContent =
        state.stage_name || "RoboScape";

    document.getElementById("stage-label").textContent =
        state.stage === 7 || state.status === "won"
            ? "MISSION COMPLETE"
            : "STAGE " + String(state.stage).padStart(2, "0");

    feedback.textContent = state.feedback || "";
    area.replaceChildren();

    if (state.status === "won" || state.stage === 7) {
        renderVictory(state);
        return;
    }

    switch (Number(state.stage)) {
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
            throw new Error("Restartul nu a reusit.");
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

// Incarca jocul o singura data la pornire.
refreshState();

// Actualizeaza cronometrul numai in etapa cu bomba.
// Nu reconstruim formularul numeric periodic.
setInterval(() => {
    if (currentState && Number(currentState.stage) === 2) {
        refreshState();
    }
}, 500);
