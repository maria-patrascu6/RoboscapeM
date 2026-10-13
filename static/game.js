
(() => {
  "use strict";

  let currentState = null;
  let busy = false;
  let loading = false;
  let pollTimer = null;

  const $ = (id) => document.getElementById(id);
  const area = () => $("game-area");

  async function api(url, options = {}) {
    const response = await fetch(url, {
      cache: "no-store",
      ...options
    });

    if (!response.ok) {
      throw new Error(`Cererea a eșuat (${response.status}).`);
    }

    return response.json();
  }

  async function getState() {
    return api("/state");
  }

  async function sendAction(action) {
    if (busy) return;

    busy = true;
    setButtonsDisabled(true);

    try {
      render(await api("/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(action)
      }));
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
      setButtonsDisabled(false);
    }
  }

  function setButtonsDisabled(disabled) {
    document.querySelectorAll(
      "#game-area button, #hint-button, #restart-button"
    ).forEach((button) => {
      button.disabled = disabled;
    });
  }

  function showError(error) {
    console.error("RoboScape:", error);

    const feedback = $("feedback");

    if (feedback) {
      feedback.textContent =
        "Nu am putut actualiza jocul. Verifică conexiunea și reîncarcă pagina.";
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) {
      node.className = className;
    }

    if (text !== undefined && text !== null) {
      node.textContent = text;
    }

    return node;
  }

  function button(text, className, action, extra = {}) {
    const b = el("button", className || "action-button", text);
    b.type = "button";

    Object.entries(extra).forEach(([key, value]) => {
      b.setAttribute(key, value);
    });

    b.addEventListener("click", action);

    return b;
  }

  function addMoveControls(parent, type) {
    const pad = el("div", "control-pad");

    const moves = [
      ["empty", ""],
      ["maze-control", "up"],
      ["empty", ""],
      ["maze-control", "left"],
      ["maze-control", "down"],
      ["maze-control", "right"]
    ];

    const labels = {
      up: "↑",
      down: "↓",
      left: "←",
      right: "→"
    };

    moves.forEach(([cls, dir]) => {
      if (cls === "empty") {
        pad.appendChild(el("span", "empty"));
      } else {
        pad.appendChild(
          button(
            labels[dir],
            cls,
            () => sendAction({
              type,
              direction: dir
            }),
            { "aria-label": dir }
          )
        );
      }
    });

    parent.appendChild(pad);
  }

  function renderMaze(state, grid = false) {
    const isGrid = grid;
    const size = isGrid ? 5 : 7;

    const walls = isGrid
      ? (state.grid_walls || [])
      : (state.maze_walls || []);

    const pos = isGrid ? state.grid_pos : state.maze_pos;

    const node = el("div", "section-layout");
    const board = el(
      "div",
      isGrid ? "security-grid" : "maze"
    );

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const wall =
          walls.some((w) => w[0] === r && w[1] === c) ||
          (
            isGrid &&
            Number(state.difficulty) >= 2 &&
            r === 3 &&
            c === 3
          );

        const cell = el(
          "div",
          isGrid ? "security-cell" : "maze-cell"
        );

        if (wall) {
          cell.classList.add("wall");
          cell.setAttribute("aria-label", "Perete");
        } else if (
          pos &&
          pos[0] === r &&
          pos[1] === c
        ) {
          cell.classList.add("player");
          cell.textContent = "🤖";
          cell.setAttribute("aria-label", "Robot");
        } else if (
          r === size - 1 &&
          c === size - 1
        ) {
          cell.classList.add("exit");
          cell.textContent = "↗";
          cell.setAttribute("aria-label", "Ieșire");
        } else {
          cell.textContent = "·";
          cell.style.color = "#42536e";
        }

        board.appendChild(cell);
      }
    }

    const controls = el("div", "stage-instructions");

    controls.appendChild(
      el(
        "p",
        "",
        isGrid
          ? "Treci prin grila de securitate și ajungi la ieșirea din colțul dreapta-jos."
          : "Găsește ieșirea din labirint. Evită pereții."
      )
    );

    addMoveControls(
      controls,
      isGrid ? "grid_move" : "maze_move"
    );

    controls.appendChild(
      el(
        "p",
        "maze-help",
        "Poți folosi și tastele săgeți de pe tastatură."
      )
    );

    node.append(board, controls);
    area().replaceChildren(node);
  }

  function updateBombTimer(state = currentState) {
    if (!state || Number(state.stage) !== 2) return;

    const timer = document.querySelector(".timer");
    if (!timer) return;

    const showing = state.bomb_phase === "show";

    const deadline = showing
      ? state.bomb_show_until
      : state.bomb_deadline;

    const seconds = Math.max(
      0,
      Math.ceil(
        (Number(deadline) || 0) - Date.now() / 1000
      )
    );

    timer.textContent = showing
      ? `Memorează: ${seconds} s`
      : `Timp rămas: ${seconds} s`;

    timer.classList.toggle(
      "timer-warning",
      !showing && seconds <= 5
    );
  }

  function renderBomb(state) {
    const wrap = el("div", "bomb-panel");
    const left = el("div", "stage-instructions");

    left.appendChild(
      el(
        "p",
        "",
        "Memorează simbolurile afișate pe bombă, apoi introdu-le în aceeași ordine."
      )
    );

    const illustration = el("div", "bomb-illustration");
    illustration.appendChild(el("div", "bomb-fuse"));
    illustration.appendChild(el("div", "bomb-wire bomb-wire-red"));
    illustration.appendChild(el("div", "bomb-wire bomb-wire-blue"));

    const shell = el("div", "bomb-shell");
    shell.appendChild(el("span", "bomb-light"));
    shell.appendChild(el("span", "bomb-label", "ROBO BOMB"));
    shell.appendChild(
      el(
        "span",
        "bomb-display-small",
        state.bomb_phase === "show" ? "MEM" : "ARM"
      )
    );

    illustration.appendChild(shell);
    left.appendChild(illustration);

    const display = el("div", "bomb-display");

    if (state.bomb_phase === "show") {
      (state.bomb_sequence || []).forEach((symbol) => {
        display.appendChild(el("span", "", symbol));
      });

      if (!(state.bomb_sequence || []).length) {
        display.textContent = "◈ ◈ ◈";
      }
    } else {
      display.textContent =
        (state.bomb_input || []).join("  ") || "?  ?  ?";
    }

    left.appendChild(display);
    left.appendChild(el("p", "timer", ""));

    const right = el("div", "stage-instructions");

    right.appendChild(
      el(
        "p",
        "",
        state.bomb_phase === "show"
          ? "Memorează secvența înainte să dispară."
          : "Apasă simbolurile în ordinea memorată înainte să expire timpul."
      )
    );

    const symbols = el("div", "symbol-buttons");

    (
      state.symbols ||
      ["▲", "●", "■", "◆", "★"]
    ).forEach((symbol) => {
      symbols.appendChild(
        button(
          symbol,
          "symbol-button",
          () => sendAction({
            type: "bomb_pick",
            symbol
          }),
          { "aria-label": `Simbol ${symbol}` }
        )
      );
    });

    if (state.bomb_phase === "input") {
      right.appendChild(symbols);
    }

    right.appendChild(
      el(
        "p",
        "memory-progress",
        `Simboluri introduse: ${(state.bomb_input || []).length}`
      )
    );

    wrap.append(left, right);
    area().replaceChildren(wrap);
    updateBombTimer(state);
  }

  function renderWires(state) {
    const panel = el("div", "wire-panel");

    panel.appendChild(
      el(
        "p",
        "stage-instructions",
        "Descurcă toate cablurile: trage capetele colorate din dreapta în sus sau în jos până când liniile nu se mai intersectează."
      )
    );

    const colors = state.colors || [
      "Albastru", "Galben", "Mov", "Verde"
    ];

    const palette = {
      "Albastru": "#4ea5ff",
      "Galben": "#f5cf54",
      "Mov": "#b49aff",
      "Verde": "#58d6a0",
      "Roșu": "#ff6f83"
    };

    const count = colors.length;
    const order = (
      state.wire_target ||
      Array.from({ length: count }, (_, i) => i)
    ).slice();

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");

    svg.setAttribute("viewBox", "0 0 360 250");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      "Cabluri colorate care pot fi descurcate prin tragerea capetelor din dreapta"
    );
    svg.classList.add("tangled-cables");

    const top = 28;
    const step = count > 1 ? 194 / (count - 1) : 0;
    const yFor = (slot) => top + slot * step;

    let drag = null;

    function svgElement(tag, attrs = {}) {
      const node = document.createElementNS(svgNS, tag);

      Object.entries(attrs).forEach(([key, value]) => {
        node.setAttribute(key, String(value));
      });

      return node;
    }

    function drawCables() {
      svg.replaceChildren();

      svg.appendChild(
        svgElement("rect", {
          x: 8,
          y: 8,
          width: 344,
          height: 234,
          rx: 12,
          fill: "#080f1d",
          stroke: "#2a3954"
        })
      );

      svg.appendChild(
        svgElement("text", {
          x: 43,
          y: 20,
          fill: "#9caec8",
          "font-size": 9,
          "text-anchor": "middle"
        })
      );

      svg.appendChild(
        svgElement("text", {
          x: 317,
          y: 20,
          fill: "#9caec8",
          "font-size": 9,
          "text-anchor": "middle"
        })
      );

      colors.forEach((name, id) => {
        const startY = yFor(id);
        const endSlot = order.indexOf(id);
        const endY = (
          drag && drag.id === id
            ? drag.y
            : yFor(endSlot)
        );

        const color = palette[name] || "#58e0e6";

        svg.appendChild(
          svgElement("path", {
            d: `M 43 ${startY} C 125 ${startY}, 235 ${endY}, 317 ${endY}`,
            fill: "none",
            stroke: color,
            "stroke-width": 5,
            "stroke-linecap": "round",
            opacity: drag && drag.id !== id ? 0.72 : 1
          })
        );
      });

      colors.forEach((name, id) => {
        const startY = yFor(id);
        const endSlot = order.indexOf(id);
        const endY = (
          drag && drag.id === id
            ? drag.y
            : yFor(endSlot)
        );

        const color = palette[name] || "#58e0e6";

        svg.appendChild(
          svgElement("circle", {
            cx: 43,
            cy: startY,
            r: 8,
            fill: color,
            stroke: "#edf4ff",
            "stroke-width": 1.5
          })
        );

        const endpoint = svgElement("circle", {
          cx: 317,
          cy: endY,
          r: 11,
          fill: color,
          stroke: "#ffffff",
          "stroke-width": 2,
          "data-wire-id": id,
          class: "wire-endpoint"
        });

        endpoint.style.cursor = "grab";
        svg.appendChild(endpoint);

        const label = svgElement("text", {
          x: 60,
          y: startY + 4,
          fill: color,
          "font-size": 10,
          "font-weight": 700
        });

        label.textContent = name;
        svg.appendChild(label);
      });
    }

    function localY(event) {
      const rect = svg.getBoundingClientRect();

      return Math.max(
        top,
        Math.min(
          top + step * (count - 1),
          (event.clientY - rect.top) * 250 / rect.height
        )
      );
    }

    svg.addEventListener("pointerdown", (event) => {
      const target = event.target.closest("[data-wire-id]");

      if (!target) return;

      event.preventDefault();

      drag = {
        id: Number(target.getAttribute("data-wire-id")),
        y: localY(event)
      };

      svg.setPointerCapture(event.pointerId);
      drawCables();
    });

    svg.addEventListener("pointermove", (event) => {
      if (!drag) return;

      drag.y = localY(event);
      drawCables();
    });

    svg.addEventListener("pointerup", (event) => {
      if (!drag) return;

      const id = drag.id;
      const oldSlot = order.indexOf(id);

      const newSlot = Math.max(
        0,
        Math.min(
          count - 1,
          Math.round((localY(event) - top) / (step || 1))
        )
      );

      if (oldSlot !== newSlot) {
        const otherId = order[newSlot];
        order[newSlot] = id;
        order[oldSlot] = otherId;
      }

      drag = null;
      drawCables();

      if (order.every((wireId, slot) => wireId === slot)) {
        panel.appendChild(
          el("p", "wire-success", "✓ Cabluri descurcate!")
        );

        sendAction({ type: "wire_solved" });
      }
    });

    svg.addEventListener("pointercancel", () => {
      drag = null;
      drawCables();
    });

    drawCables();

    panel.appendChild(svg);

    panel.appendChild(
      el(
        "p",
        "memory-progress",
        "Trage capetele rotunde din partea dreaptă. Cablurile nu trebuie să se intersecteze."
      )
    );

    area().replaceChildren(panel);
  }

  function renderLogic(state) {
    const box = el("div", "logic-box");

    box.appendChild(
      el(
        "p",
        "logic-question",
        state.logic_question || "Rezolvă șirul numeric."
      )
    );

    box.appendChild(
      el(
        "p",
        "stage-instructions",
        "Introdu numărul care completează șirul."
      )
    );

    const form = el("form", "answer-form");
    const input = el("input", "", "");

    input.type = "number";
    input.inputMode = "numeric";
    input.placeholder = "Răspuns numeric";
    input.required = true;
    input.setAttribute("aria-label", "Răspuns numeric");

    form.appendChild(input);

    const submit = el(
      "button",
      "primary-button",
      "Verifică răspunsul"
    );

    submit.type = "submit";
    form.appendChild(submit);

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (input.value.trim() !== "") {
        sendAction({
          type: "logic_submit",
          answer: input.value
        });
      }
    });

    box.appendChild(form);
    area().replaceChildren(box);
  }

  function pipeSymbol(tile) {
    return tile.kind === "straight"
      ? (tile.rotation % 2 === 0 ? "│" : "─")
      : ["└", "┌", "┐", "┘"][tile.rotation % 4];
  }

  function renderCircuit(state) {
    const wrap = el("div", "circuit-wrap");

    wrap.appendChild(
      el(
        "p",
        "stage-instructions",
        "Rotește piesele de conductă până când creezi un traseu continuu între sursa de energie din stânga și ieșirea din dreapta-jos."
      )
    );

    const legend = el("div", "circuit-legend");

    legend.appendChild(el("span", "source-label", "⚡ SURSA"));
    legend.appendChild(el("span", "exit-label", "◎ IEȘIRE"));

    wrap.appendChild(legend);

    const grid = el("div", "circuit-grid");

    (state.circuit || []).forEach((tile, index) => {
      const b = button(
        pipeSymbol(tile),
        "circuit-tile",
        () => sendAction({
          type: "circuit_rotate",
          index
        }),
        { "aria-label": `Rotește piesa ${index + 1}` }
      );

      if (index === 0) b.classList.add("source");
      if (index === 15) b.classList.add("exit");

      if ([0, 1, 2, 6, 10, 11, 15].includes(index)) {
        b.classList.add("route-candidate");
      }

      b.title = index === 0
        ? "Sursă: conectează conducta spre dreapta"
        : index === 15
          ? "Ieșire: conectează conducta dinspre sus spre dreapta"
          : `Rotește piesa ${index + 1}`;

      grid.appendChild(b);
    });

    wrap.appendChild(grid);

    wrap.appendChild(
      el(
        "p",
        "circuit-caption",
        "Apasă pe orice piesă pentru a o roti cu 90°. Conductele trebuie să formeze o cale neîntreruptă."
      )
    );

    area().replaceChildren(wrap);
  }

  function renderVictory(state) {
    const box = el("div", "victory");

    box.appendChild(el("div", "victory-icon", "✦"));
    box.appendChild(el("h3", "", "Misiune îndeplinită!"));

    box.appendChild(
      el(
        "p",
        "",
        state.feedback || "Ai reușit să evadezi de pe navă."
      )
    );

    box.appendChild(
      el(
        "p",
        "",
        `Provocări reușite: ${state.successes} · Greșeli: ${state.mistakes} · Indicii: ${state.hints}`
      )
    );

    box.appendChild(
      button(
        "Joacă din nou",
        "primary-button",
        () => sendAction({ type: "restart" })
      )
    );

    area().replaceChildren(box);
  }

  function render(state) {
    if (
      !state ||
      typeof state !== "object" ||
      !Number.isFinite(Number(state.stage))
    ) {
      throw new Error(
        "Răspunsul serverului nu are formatul așteptat."
      );
    }

    currentState = state;

    $("stage-number").textContent =
      Number(state.stage) <= 6
        ? `${state.stage} / 6`
        : "6 / 6";

    $("difficulty").textContent =
      state.difficulty_name ||
      ({ 1: "Ușor", 2: "Mediu", 3: "Dificil" }[state.difficulty] || "Mediu");

    $("mistakes").textContent = state.mistakes ?? 0;
    $("hints").textContent = state.hints ?? 0;

    $("stage-label").textContent =
      Number(state.stage) <= 6
        ? `ETAPA ${String(state.stage).padStart(2, "0")}`
        : "MISIUNE FINALIZATĂ";

    $("stage-name").textContent = state.stage_name || "RoboScape";
    $("feedback").textContent = state.feedback || "Continuă misiunea.";

    if (state.status === "won" || Number(state.stage) > 6) {
      return renderVictory(state);
    }

    switch (Number(state.stage)) {
      case 1:
        renderMaze(state, false);
        break;
      case 2:
        renderBomb(state);
        break;
      case 3:
        renderWires(state);
        break;
      case 4:
        renderMaze(state, true);
        break;
      case 5:
        renderLogic(state);
        break;
      case 6:
        renderCircuit(state);
        break;
      default:
        area().replaceChildren(
          el("p", "loading-error", "Etapa jocului nu este recunoscută.")
        );
    }
  }

  function sameBombView(a, b) {
    return (
      a &&
      b &&
      Number(a.stage) === 2 &&
      Number(b.stage) === 2 &&
      a.bomb_phase === b.bomb_phase &&
      JSON.stringify(a.bomb_sequence || []) ===
        JSON.stringify(b.bomb_sequence || []) &&
      JSON.stringify(a.bomb_input || []) ===
        JSON.stringify(b.bomb_input || []) &&
      a.feedback === b.feedback &&
      a.status === b.status
    );
  }

  async function refreshState() {
    if (loading || busy) return;

    loading = true;

    try {
      const state = await getState();

      if (sameBombView(currentState, state)) {
        currentState = state;
        updateBombTimer(state);
      } else {
        render(state);
      }
    } catch (error) {
      showError(error);
    } finally {
      loading = false;
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);

    pollTimer = setInterval(() => {
      if (
        currentState &&
        Number(currentState.stage) === 2 &&
        !busy
      ) {
        refreshState();
      }

      if (
        currentState &&
        Number(currentState.stage) === 2
      ) {
        updateBombTimer(currentState);
      }
    }, 500);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    $("hint-button").addEventListener("click", () => {
      sendAction({ type: "hint" });
    });

    $("restart-button").addEventListener("click", () => {
      sendAction({ type: "restart" });
    });

    document.addEventListener("keydown", (event) => {
      if (event.target instanceof HTMLInputElement) return;

      const dirs = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right"
      };

      const direction = dirs[event.key];

      if (!direction || !currentState || busy) return;

      if (Number(currentState.stage) === 1) {
        event.preventDefault();
        sendAction({
          type: "maze_move",
          direction
        });
      } else if (Number(currentState.stage) === 4) {
        event.preventDefault();
        sendAction({
          type: "grid_move",
          direction
        });
      }
    });

    try {
      render(await getState());
    } catch (error) {
      showError(error);

      $("game-area").replaceChildren(
        el(
          "div",
          "loading-error",
          "Misiunea nu s-a putut încărca. Reîncarcă pagina; dacă problema persistă, verifică logurile serverului."
        )
      );
    }

    startPolling();
  });
})();
