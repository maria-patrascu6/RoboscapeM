
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

const wireColorNames = [
    "Albastru",
    "Galben",
    "Mov",
    "Verde",
    "Rosu"
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

function addPanelTitle(title) {
    const heading = document.createElement("h3");
    heading.className = "game-panel-title";
    heading.textContent = title;
    area.appendChild(heading);
    return heading;
}

/* =====================================================
   ETAPA 1 - LABIRINT
   ===================================================== */

function renderMaze(state) {
    addDescription(
        "Ghideaza robotul prin labirint. Evita peretii si gaseste iesirea."
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
                cell.setAttribute("aria-label", "Perete");
            } else if (row === playerRow && col === playerCol) {
                cell.classList.add("player");
                cell.textContent = "🤖";
                cell.setAttribute("aria-label", "Robotul");
            } else if (row === 6 && col === 6) {
                cell.classList.add("exit");
                cell.textContent = "🚪";
                cell.setAttribute("aria-label", "Iesire");
                cell.title = "IESIRE";
            } else if (row === 0 && col === 0) {
                cell.textContent = "START";
                cell.classList.add("start-cell");
            } else {
                cell.textContent = "";
            }

            maze.appendChild(cell);
        }
    }

    area.appendChild(maze);

    const legend = document.createElement("p");
    legend.className = "maze-legend";
    legend.textContent = "🤖 Robot   ■ Perete   🚪 Iesire";
    area.appendChild(legend);

    addDirections("maze_move");
}

/* =====================================================
   CONTROLLER CU SAGETI
   Folosit de labirint si grila de securitate.
   ===================================================== */

function addDirections(actionType) {
    const controls = document.createElement("div");
    controls.className = "controls dpad";

    const positions = [
        { label: "↑", direction: "up", position: "up" },
        { label: "←", direction: "left", position: "left" },
        { label: "↓", direction: "down", position: "down" },
        { label: "→", direction: "right", position: "right" }
    ];

    positions.forEach(item => {
        const button = makeButton(
            item.label,
            "control-button dpad-" + item.position,
            () => {
                sendAction({
                    type: actionType,
                    direction: item.direction
                });
            }
        );

        button.setAttribute(
            "aria-label",
            "Muta robotul " + item.direction
        );

        controls.appendChild(button);
    });

    area.appendChild(controls);
}

/* =====================================================
   ETAPA 2 - BOMBA SI MEMORAREA SIMBOLURILOR
   ===================================================== */

function renderBomb(state) {
    const showing = state.bomb_phase === "show";

    addDescription(
        showing
            ? "Memoreaza simbolurile afisate pe bomba."
            : "Introdu simbolurile in aceeasi ordine. Ai grija la timp!"
    );

    const bombPanel = document.createElement("div");
    bombPanel.className = "bomb-panel";

    const bomb = document.createElement("div");
    bomb.className = "bomb-illustration";

    const wire = document.createElement("div");
    wire.className = "bomb-wire";
    bomb.appendChild(wire);

    const cap = document.createElement("div");
    cap.className = "bomb-cap";
    bomb.appendChild(cap);

    const body = document.createElement("div");
    body.className = "bomb-body";

    const display = document.createElement("div");
    display.className = "bomb-display";
    display.textContent = showing ? "MEMORY" : "ENTER";
    body.appendChild(display);

    const emblem = document.createElement("div");
    emblem.className = "bomb-emblem";
    emblem.textContent = "⚠";
    body.appendChild(emblem);

    const bombLabel = document.createElement("div");
    bombLabel.className = "bomb-label";
    bombLabel.textContent = "ROBO-DEVICE // 02";
    body.appendChild(bombLabel);

    bomb.appendChild(body);
    bombPanel.appendChild(bomb);

    const status = document.createElement("p");
    status.className = "bomb-status";
    status.textContent = showing
        ? "SECVENTA DE MEMORAT"
        : "REINTRODU SECVENTA";
    bombPanel.appendChild(status);

    area.appendChild(bombPanel);

    const timer = document.createElement("p");
    timer.className = "timer";

    let remaining;

    if (showing) {
        remaining = Math.max(
            0,
            Math.ceil(
                (state.bomb_show_until || 0) - Date.now() / 1000
            )
        );
        timer.textContent = "MEMOREAZA: " + remaining + " s";
    } else {
        remaining = Math.max(
            0,
            Math.ceil(
                (state.bomb_deadline || 0) - Date.now() / 1000
            )
        );
        timer.textContent = "TIMP RAMAS: " + remaining + " s";
    }

    if (remaining <= 5) {
        timer.classList.add("timer-warning");
    }

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

        addDescription(
            "Retine atat simbolurile, cat si ordinea lor."
        );
        return;
    }

    const input = state.bomb_input || [];
    const progress = document.createElement("div");
    progress.className = "bomb-progress";

    const progressLabel = document.createElement("p");
    progressLabel.textContent =
        "Simboluri introduse: " + input.length;
    progress.appendChild(progressLabel);

    const entered = document.createElement("div");
    entered.className = "memory-sequence entered-sequence";

    input.forEach(symbol => {
        const item = document.createElement("div");
        item.className = "memory-symbol";
        item.textContent = symbol;
        entered.appendChild(item);
    });

    progress.appendChild(entered);
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

/* =====================================================
   ETAPA 3 - CABLURI
   ===================================================== */

function renderWires(state) {
    addDescription(
        "Analizeaza traseele firelor. Selecteaza culorile in ordinea " +
        "terminalelor de la 1 la ultimul terminal."
    );

    const panel = document.createElement("div");
    panel.className = "wire-panel";

    const heading = document.createElement("h3");
    heading.className = "wire-heading";
    heading.textContent = "⚡ PANOU DE CONEXIUNI";
    panel.appendChild(heading);

    const subtitle = document.createElement("p");
    subtitle.className = "wire-subtitle";
    subtitle.textContent = "IDENTIFICA TRASEUL FIECARUI FIR";
    panel.appendChild(subtitle);

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");

    svg.setAttribute("viewBox", "0 0 600 350");
    svg.setAttribute("width", "100%");
    svg.setAttribute("role", "img");
    svg.setAttribute(
        "aria-label",
        "Panou cu fire colorate incurcate intre terminale"
    );

    const colors = state.colors || wireColorNames;
    const target = state.wire_target || [];
    const input = state.wire_input || [];
    const connected = new Set(input);

    const rowY = index => 55 + index * 58;

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

    function addSvgElement(tag, attributes, textContent) {
        const element = document.createElementNS(svgNS, tag);

        Object.entries(attributes).forEach(([key, value]) => {
            element.setAttribute(key, String(value));
        });

        if (textContent !== undefined) {
            element.textContent = textContent;
        }

        svg.appendChild(element);
        return element;
    }

    // Fundal decorativ si linii de circuit.
    addSvgElement("rect", {
        x: 4, y: 4, width: 592, height: 342,
        rx: 14, fill: "#0b1425", stroke: "#263955"
    });

    for (let x = 130; x <= 470; x += 40) {
        addSvgElement("line", {
            x1: x, y1: 15, x2: x, y2: 335,
            stroke: "#17263d", "stroke-width": 1
        });
    }

    // Etichetele panoului.
    addSvgElement("text", {
        x: 18, y: 27, fill: "#a9bdd7",
        "font-size": 11, "font-weight": "bold"
    }, "FIRE");

    addSvgElement("text", {
        x: 490, y: 27, fill: "#51e5ff",
        "font-size": 11, "font-weight": "bold"
    }, "IESIRI");

    // Desenam firele inaintea terminalelor.
    colors.forEach((color, index) => {
        const startY = rowY(index);
        const endY = rowY(slotForColor[index]);
        const isConnected = connected.has(index);
        const stroke = wireColors[index % wireColors.length];

        const bend1 = 125 + ((index * 83 + 45) % 125);
        const bend2 = 310 + ((index * 67 + 70) % 115);

        const pathData =
            "M 100 " + startY +
            " C " + bend1 + " " + (startY + 35) +
            ", " + bend2 + " " + (endY - 35) +
            ", 492 " + endY;

        // Umbra luminoasa a firului.
        addSvgElement("path", {
            d: pathData,
            fill: "none",
            stroke: stroke,
            "stroke-width": 13,
            "stroke-linecap": "round",
            opacity: 0.12
        });

        // Firul propriu-zis.
        addSvgElement("path", {
            d: pathData,
            fill: "none",
            stroke: stroke,
            "stroke-width": isConnected ? 4 : 6,
            "stroke-linecap": "round",
            opacity: isConnected ? 0.3 : 0.95
        });
    });

    // Terminalele colorate din stanga.
    colors.forEach((color, index) => {
        const y = rowY(index);
        const isConnected = connected.has(index);
        const stroke = wireColors[index % wireColors.length];

        addSvgElement("rect", {
            x: 55, y: y - 17, width: 48, height: 34,
            rx: 7, fill: "#111f35", stroke: stroke,
            "stroke-width": 2,
            opacity: isConnected ? 0.4 : 1
        });

        const terminal = addSvgElement("circle", {
            cx: 100, cy: y, r: 10,
            fill: stroke, stroke: "#ffffff",
            "stroke-width": 2,
            opacity: isConnected ? 0.4 : 1
        });

        if (!isConnected) {
            terminal.style.cursor = "pointer";
            terminal.setAttribute("tabindex", "0");
            terminal.setAttribute(
                "aria-label",
                "Selecteaza firul " + color
            );

            const selectWire = () => {
                sendAction({
                    type: "wire_pick",
                    color: index
                });
            };

            terminal.addEventListener("click", selectWire);
            terminal.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectWire();
                }
            });
        }

        addSvgElement("text", {
            x: 18, y: y + 4,
            fill: "#edf5ff",
            "font-size": 10
        }, String(color).toUpperCase().slice(0, 7));

        if (isConnected) {
            addSvgElement("text", {
                x: 130, y: y + 5,
                fill: "#64f0ae",
                "font-size": 17,
                "font-weight": "bold"
            }, "✓");
        }
    });

    // Terminalele de iesire si numerele acestora.
    colors.forEach((color, index) => {
        const y = rowY(index);

        addSvgElement("rect", {
            x: 485, y: y - 17, width: 42, height: 34,
            rx: 7, fill: "#101a2b",
            stroke: "#51e5ff", "stroke-width": 2
        });

        addSvgElement("circle", {
            cx: 492, cy: y, r: 7,
            fill: "#51e5ff"
        });

        addSvgElement("text", {
            x: 548, y: y + 5,
            fill: "#edf5ff",
            "font-size": 17,
            "font-weight": "bold",
            "text-anchor": "middle"
        }, String(index + 1));
    });

    panel.appendChild(svg);

    const progress = document.createElement("div");
    progress.className = "wire-progress";

    const progressLabel = document.createElement("p");
    progressLabel.textContent =
        "Fire identificate: " + input.length + " / " + target.length;
    progress.appendChild(progressLabel);

    const track = document.createElement("div");
    track.className = "wire-progress-track";

    const fill = document.createElement("div");
    fill.className = "wire-progress-fill";
    fill.style.width = target.length
        ? Math.min(100, input.length / target.length * 100) + "%"
        : "0%";

    track.appendChild(fill);
    progress.appendChild(track);
    panel.appendChild(progress);

    const instructions = document.createElement("p");
    instructions.className = "wire-instructions";
    instructions.textContent =
        "Apasa terminalul colorat din stanga. Urmareste firul pana la " +
        "iesirea numerotata si identifica firele in ordinea ceruta.";
    panel.appendChild(instructions);

    area.appendChild(panel);
}

/* =====================================================
   ETAPA 4 - GRILA DE SECURITATE
   ===================================================== */

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
                cell.textContent = "🚪";
                cell.title = "EXIT";
            } else {
                cell.textContent = "";
            }

            grid.appendChild(cell);
        }
    }

    area.appendChild(grid);

    const legend = document.createElement("p");
    legend.className = "maze-legend";
    legend.textContent = "🤖 Robot   ■ Perete   🚪 Iesire";
    area.appendChild(legend);

    addDirections("grid_move");
}

/* =====================================================
   ETAPA 5 - LOGICA
   ===================================================== */

function renderLogic(state) {
    addDescription(
        "Rezolva problema logica si introdu raspunsul numeric."
    );

    const question = document.createElement("h3");
    question.className = "logic-question";
    question.textContent =
        state.logic_question || "Care este urmatorul numar?";
    area.appendChild(question);

    const form = document.createElement("form");
    form.className = "answer-form";

    const input = document.createElement("input");
    input.type = "number";
    input.step = "1";
    input.placeholder = "Scrie raspunsul";
    input.required = true;
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Raspuns numeric");

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
    input.focus();
}

/* =====================================================
   ETAPA 6 - CIRCUITUL FINAL
   ===================================================== */

function renderCircuit(state) {
    addDescription(
        "Roteste piesele pentru a crea un traseu continuu de la sursa " +
        "de energie la capsula de evacuare."
    );

    const guide = document.createElement("div");
    guide.className = "circuit-guide";

    const source = document.createElement("div");
    source.className = "circuit-landmark source-landmark";
    source.innerHTML = "<span>⚡</span><strong>SURSA</strong><small>Intrare</small>";

    const arrow = document.createElement("div");
    arrow.className = "circuit-guide-arrow";
    arrow.textContent = "→";

    const destination = document.createElement("div");
    destination.className = "circuit-landmark exit-landmark";
    destination.innerHTML = "<span>🚀</span><strong>CAPSULA</strong><small>Iesire</small>";

    guide.appendChild(source);
    guide.appendChild(arrow);
    guide.appendChild(destination);
    area.appendChild(guide);

    const legend = document.createElement("p");
    legend.className = "circuit-legend";
    legend.textContent =
        "Sursa intra prin partea STANGA a primei piese. " +
        "Capsula este conectata la partea de JOS a ultimei piese.";
    area.appendChild(legend);

    const grid = document.createElement("div");
    grid.className = "circuit-grid";

    (state.circuit || []).forEach((tile, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "circuit-tile " + tile.kind;
        button.setAttribute(
            "aria-label",
            "Roteste piesa " + (index + 1) +
            ", rotatie " + tile.rotation
        );
        button.title = "Piesa " + (index + 1) + " - apasa pentru rotire";

        // Marcaje pentru intrare si iesire.
        if (index === 0) {
            button.classList.add("circuit-source-tile");
        }

        if (index === 15) {
            button.classList.add("circuit-exit-tile");
        }

        const number = document.createElement("span");
        number.className = "circuit-tile-number";
        number.textContent = String(index + 1);
        button.appendChild(number);

        const pipe = document.createElement("span");
        pipe.className = "pipe";
        pipe.textContent = tile.kind === "straight" ? "│" : "└";
        pipe.style.transform =
            "rotate(" + (tile.rotation * 90) + "deg)";
        button.appendChild(pipe);

        if (index === 0) {
            const entryMarker = document.createElement("span");
            entryMarker.className = "circuit-entry-marker";
            entryMarker.textContent = "IN";
            button.appendChild(entryMarker);
        }

        if (index === 15) {
            const exitMarker = document.createElement("span");
            exitMarker.className = "circuit-exit-marker";
            exitMarker.textContent = "OUT";
            button.appendChild(exitMarker);
        }

        button.addEventListener("click", () => {
            sendAction({
                type: "circuit_rotate",
                index: index
            });
        });

        grid.appendChild(button);
    });

    area.appendChild(grid);

    const instruction = document.createElement("p");
    instruction.className = "circuit-instruction";
    instruction.textContent =
        "Apasa pe fiecare piesa pentru a o roti cu 90°. " +
        "Aliniaza deschiderile pieselor vecine pentru a forma circuitul.";
    area.appendChild(instruction);
}

/* =====================================================
   FINALUL JOCULUI
   ===================================================== */

function renderVictory(state) {
    const panel = document.createElement("div");
    panel.className = "victory";

    const icon = document.createElement("div");
    icon.className = "victory-icon";
    icon.textContent = "🚀";

    const title = document.createElement("h2");
    title.textContent = "MISIUNE REUSITA!";

    const description = document.createElement("p");
    description.textContent =
        "Ai terminat toate etapele. Greseli: " +
        state.mistakes +
        ". Indicii folosite: " +
        state.hints + ".";

    panel.appendChild(icon);
    panel.appendChild(title);
    panel.appendChild(description);
    area.appendChild(panel);
}

/* =====================================================
   AFISAREA ETAPELOR
   ===================================================== */

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

/* =====================================================
   INCARCARE SI BUTOANE GENERALE
   ===================================================== */

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

document.getElementById("restart-button").addEventListener(
    "click",
    async () => {
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
    }
);

// Incarca jocul la pornire.
refreshState();

// Actualizeaza cronometrul bombei periodic.
setInterval(() => {
    if (currentState && Number(currentState.stage) === 2) {
        refreshState();
    }
}, 500);
