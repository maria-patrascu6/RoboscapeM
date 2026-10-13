
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
      let message = `Cererea a eșuat (${response.status}).`;

      try {
        const data = await response.json();
        if (data.error) message = data.error;
      } catch (_) {}

      throw new Error(message);
    }

    return response.json();
  }

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function button(text, className, callback, attributes = {}) {
    const node = el("button", className, text);
    node.type = "button";

    Object.entries(attributes).forEach(([key, value]) => {
      node.setAttribute(key, value);
    });

    node.addEventListener("click", callback);
    return node;
  }

  async function sendAction(action) {
    if (busy) return;

    busy = true;
    setButtonsDisabled(true);

    try {
      const state = await api("/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action)
      });

      render(state);

      if (action.type === "restart" || state.status === "won") {
        loadLeaderboard();
      }
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
    $("feedback").textContent =
      "Nu am putut actualiza jocul. Reîncarcă pagina sau verifică serverul.";
  }

  function renderNameScreen() {
    const wrap = el("div", "name-screen");
    wrap.appendChild(el("div", "name-robot", "🤖"));
    wrap.appendChild(el("h3", "", "Înainte să începi misiunea..."));
    wrap.appendChild(el(
      "p", "stage-instructions",
      "Alege un nume sau o poreclă. Acesta va apărea în clasament."
    ));

    const form = el("form", "name-form");
    const input = el("input");
    input.type = "text";
    input.name = "player-name";
    input.maxLength = 30;
    input.minLength = 2;
    input.placeholder = "Numele sau porecla ta";
    input.autocomplete = "nickname";
    input.required = true;
    input.setAttribute("aria-label", "Numele sau porecla ta");

    const submit = el("button", "primary-button", "Începe misiunea");
    submit.type = "submit";

    const error = el("p", "name-error");
    error.setAttribute("aria-live", "polite");

    form.append(input, submit);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = input.value.trim().replace(/\s+/g, " ");

      if (name.length < 2) {
        error.textContent = "Introdu cel puțin 2 caractere.";
        return;
      }

      submit.disabled = true;
      error.textContent = "";

      try {
        const state = await api("/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name })
        });
        render(state);
        loadLeaderboard();
      } catch (err) {
        error.textContent = err.message;
      } finally {
        submit.disabled = false;
      }
    });

    wrap.append(form, error);
    area().replaceChildren(wrap);
    $("stats-panel").hidden = true;
    $("hint-button").hidden = true;
    $("restart-button").hidden = true;
  }

  function addMoveControls(parent, type) {
    const pad = el("div", "control-pad");
    const moves = [
      ["", ""], ["up", "↑"], ["", ""],
      ["left", "←"], ["down", "↓"], ["right", "→"]
    ];

    moves.forEach(([direction, label]) => {
      if (!direction) {
        pad.appendChild(el("span", "empty"));
      } else {
        pad.appendChild(button(
          label,
          "maze-control",
          () => sendAction({ type, direction }),
          { "aria-label": direction }
        ));
      }
    });

    parent.appendChild(pad);
  }

  function renderMaze(state, isGrid = false) {
    const size = isGrid ? 5 : 7;
    const walls = isGrid ? state.grid_walls : state.maze_walls;
    const pos = isGrid ? state.grid_pos : state.maze_pos;
    const wrap = el("div", "section-layout");
    const board = el("div", isGrid ? "security-grid" : "maze");

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = el("div", isGrid ? "security-cell" : "maze-cell");
        const wall = (walls || []).some(
          (w) => w[0] === r && w[1] === c
        ) || (isGrid && state.difficulty >= 2 && r === 3 && c === 3);

        if (wall) {
          cell.classList.add("wall");
        } else if (pos && pos[0] === r && pos[1] === c) {
          cell.classList.add("player");
          cell.textContent = "🤖";
        } else if (r === size - 1 && c === size - 1) {
          cell.classList.add("exit");
          cell.textContent = "↗";
        } else {
          cell.textContent = "·";
        }

        board.appendChild(cell);
      }
    }

    const controls = el("div", "stage-instructions");
    controls.appendChild(el(
      "p", "",
      isGrid
        ? "Treci prin grila de securitate și ajungi la ieșirea din dreapta-jos."
        : "Găsește ieșirea din labirint și evită pereții."
    ));

    addMoveControls(controls, isGrid ? "grid_move" : "maze_move");
    controls.appendChild(el(
      "p", "maze-help",
      "Poți folosi și tastele săgeți de pe tastatură."
    ));

    wrap.append(board, controls);
    area().replaceChildren(wrap);
  }

  function updateBombTimer(state) {
    const timer = document.querySelector(".timer");
    if (!timer || !state || state.stage !== 2) return;

    const showing = state.bomb_phase === "show";
    const deadline = showing
      ? state.bomb_show_until
      : state.bomb_deadline;

    const seconds = Math.max(
      0, Math.ceil((Number(deadline) || 0) - Date.now() / 1000)
    );

    timer.textContent = showing
      ? `Memorează: ${seconds} s`
      : `Timp rămas: ${seconds} s`;

    timer.classList.toggle("timer-warning", !showing && seconds <= 5);
  }

  function renderBomb(state) {
    const wrap = el("div", "bomb-panel");
    const left = el("div", "stage-instructions");
    left.appendChild(el(
      "p", "", "Memorează simbolurile, apoi introdu-le în aceeași ordine."
    ));

    const illustration = el("div", "bomb-illustration");
    illustration.appendChild(el("div", "bomb-fuse"));
    illustration.appendChild(el("div", "bomb-wire bomb-wire-red"));
    illustration.appendChild(el("div", "bomb-wire bomb-wire-blue"));

    const shell = el("div", "bomb-shell");
    shell.appendChild(el("span", "bomb-light"));
    shell.appendChild(el("span", "bomb-label", "ROBO BOMB"));
    shell.appendChild(el(
      "span", "bomb-display-small",
      state.bomb_phase === "show" ? "MEM" : "ARM"
    ));

    illustration.appendChild(shell);
    left.appendChild(illustration);

    const display = el("div", "bomb-display");
    if (state.bomb_phase === "show") {
      (state.bomb_sequence || []).forEach((symbol) => {
        display.appendChild(el("span", "", symbol));
      });
    } else {
      display.textContent = (state.bomb_input || []).join("  ") || "?  ?  ?";
    }

    left.append(display, el("p", "timer"));
    const right = el("div", "stage-instructions");
    right.appendChild(el(
      "p", "",
      state.bomb_phase === "show"
        ? "Memorează secvența înainte să dispară."
        : "Apasă simbolurile în ordinea memorată."
    ));

    if (state.bomb_phase === "input") {
      const symbols = el("div", "symbol-buttons");
      (state.symbols || []).forEach((symbol) => {
        symbols.appendChild(button(
          symbol, "symbol-button",
          () => sendAction({ type: "bomb_pick", symbol })
        ));
      });
      right.appendChild(symbols);
    }

    right.appendChild(el(
      "p", "memory-progress",
      `Simboluri introduse: ${(state.bomb_input || []).length}`
    ));

    wrap.append(left, right);
    area().replaceChildren(wrap);
    updateBombTimer(state);
  }

  function renderWires(state) {
    const panel = el("div", "wire-panel");
    panel.appendChild(el(
      "p", "stage-instructions",
      "Descurcă toate cablurile. Trage capetele rotunde din dreapta până când culorile sunt în ordine."
    ));

    const colors = state.colors || [];
    const order = (state.wire_target || []).slice();
    const palette = {
      Albastru: "#4ea5ff", Galben: "#f5cf54",
      Mov: "#b49aff", Verde: "#58d6a0", Roșu: "#ff6f83"
    };

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 360 250");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Cabluri colorate interactive");
    svg.classList.add("tangled-cables");

    const top = 28;
    const step = colors.length > 1 ? 194 / (colors.length - 1) : 0;
    const yFor = (slot) => top + slot * step;
    let drag = null;

    function addSvg(tag, attrs) {
      const node = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
      return node;
    }

    function draw() {
      svg.replaceChildren();
      svg.appendChild(addSvg("rect", {
        x: 8, y: 8, width: 344, height: 234, rx: 12,
        fill: "#080f1d", stroke: "#2a3954"
      }));

      colors.forEach((name, id) => {
        const startY = yFor(id);
        const slot = order.indexOf(id);
        const endY = drag && drag.id === id ? drag.y : yFor(slot);
        const color = palette[name] || "#58e0e6";

        svg.appendChild(addSvg("path", {
          d: `M 43 ${startY} C 125 ${startY}, 235 ${endY}, 317 ${endY}`,
          fill: "none", stroke: color, "stroke-width": 5,
          "stroke-linecap": "round"
        }));

        svg.appendChild(addSvg("circle", {
          cx: 43, cy: startY, r: 8, fill: color,
          stroke: "#edf4ff", "stroke-width": 1.5
        }));

        svg.appendChild(addSvg("circle", {
          cx: 317, cy: endY, r: 11, fill: color,
          stroke: "#ffffff", "stroke-width": 2,
          "data-wire-id": id, class: "wire-endpoint"
        }));
      });
    }

    function localY(event) {
      const rect = svg.getBoundingClientRect();
      return Math.max(top, Math.min(
        top + step * (colors.length - 1),
        (event.clientY - rect.top) * 250 / rect.height
      ));
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
      draw();
    });

    svg.addEventListener("pointermove", (event) => {
      if (!drag) return;
      drag.y = localY(event);
      draw();
    });

    svg.addEventListener("pointerup", (event) => {
      if (!drag) return;

      const id = drag.id;
      const oldSlot = order.indexOf(id);
      const newSlot = Math.max(0, Math.min(
        colors.length - 1,
        Math.round((localY(event) - top) / (step || 1))
      ));

      if (oldSlot !== newSlot) {
        const other = order[newSlot];
        order[newSlot] = id;
        order[oldSlot] = other;
      }

      drag = null;
      draw();

      if (order.every((wire, index) => wire === index)) {
        panel.appendChild(el("p", "wire-success", "✓ Cabluri descurcate!"));
        sendAction({ type: "wire_solved" });
      }
    });

    svg.addEventListener("pointercancel", () => {
      drag = null;
      draw();
    });

    draw();
    panel.appendChild(svg);
    panel.appendChild(el(
      "p", "memory-progress",
      "Trage capetele din dreapta până când toate culorile sunt în ordine."
    ));

    area().replaceChildren(panel);
  }

  function renderLogic(state) {
    const box = el("div", "logic-box");
    box.appendChild(el("p", "logic-question", state.logic_question));
    box.appendChild(el(
      "p", "stage-instructions", "Introdu numărul care completează șirul."
    ));

    const form = el("form", "answer-form");
    const input = el("input");
    input.type = "number";
    input.required = true;
    input.placeholder = "Răspuns numeric";
    input.setAttribute("aria-label", "Răspuns numeric");

    const submit = el("button", "primary-button", "Verifică răspunsul");
    submit.type = "submit";

    form.append(input, submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (input.value.trim()) {
        sendAction({ type: "logic_submit", answer: input.value });
      }
    });

    box.appendChild(form);
    area().replaceChildren(box);
  }

  function pipeSymbol(tile) {
    if (tile.kind === "straight") {
      return tile.rotation % 2 === 0 ? "│" : "─";
    }
    return ["└", "┌", "┐", "┘"][tile.rotation % 4];
  }

  function renderCircuit(state) {
    const wrap = el("div", "circuit-wrap");
    wrap.appendChild(el(
      "p", "stage-instructions",
      "Rotește piesele până creezi un traseu continuu între sursă și ieșire."
    ));

    const legend = el("div", "circuit-legend");
    legend.appendChild(el("span", "source-label", "⚡ SURSA"));
    legend.appendChild(el("span", "exit-label", "◎ IEȘIRE"));
    wrap.appendChild(legend);

    const grid = el("div", "circuit-grid");

    (state.circuit || []).forEach((tile, index) => {
      const node = button(
        pipeSymbol(tile), "circuit-tile",
        () => sendAction({ type: "circuit_rotate", index }),
        { "aria-label": `Rotește piesa ${index + 1}` }
      );

      if (index === 0) node.classList.add("source");
      if (index === 15) node.classList.add("exit");

      grid.appendChild(node);
    });

    wrap.appendChild(grid);
    wrap.appendChild(el(
      "p", "circuit-caption",
      "Apasă pe o piesă pentru a o roti cu 90°."
    ));

    area().replaceChildren(wrap);
  }

  function renderVictory(state) {
    const box = el("div", "victory");
    box.appendChild(el("div", "victory-icon", "✦"));
    box.appendChild(el("h3", "", "Misiune îndeplinită!"));
    box.appendChild(el(
      "p", "", state.feedback || "Ai reușit să evadezi de pe navă."
    ));
    box.appendChild(el(
      "p", "",
      `Etape: ${state.successes} · Greșeli: ${state.mistakes} · Indicii: ${state.hints}`
    ));
    box.appendChild(button(
      "Joacă din nou", "primary-button",
      () => sendAction({ type: "restart" })
    ));
    area().replaceChildren(box);
  }

  function render(state) {
    if (!state || typeof state !== "object") {
      throw new Error("Răspuns invalid de la server.");
    }

    if (state.needs_name) {
      currentState = null;
      renderNameScreen();
      return;
    }

    currentState = state;
    $("stats-panel").hidden = false;
    $("hint-button").hidden = false;
    $("restart-button").hidden = false;

    $("stage-number").textContent =
      state.stage <= 6 ? `${state.stage} / 6` : "6 / 6";
    $("difficulty").textContent = state.difficulty_name || "Mediu";
    $("mistakes").textContent = state.mistakes ?? 0;
    $("hints").textContent = state.hints ?? 0;
    $("stage-label").textContent =
      state.stage <= 6
        ? `ETAPA ${String(state.stage).padStart(2, "0")}`
        : "MISIUNE FINALIZATĂ";
    $("stage-name").textContent = state.stage_name || "RoboScape";
    $("feedback").textContent = state.feedback || "Continuă misiunea.";

    if (state.status === "won" || state.stage > 6) {
      renderVictory(state);
      return;
    }

    switch (Number(state.stage)) {
      case 1: renderMaze(state); break;
      case 2: renderBomb(state); break;
      case 3: renderWires(state); break;
      case 4: renderMaze(state, true); break;
      case 5: renderLogic(state); break;
      case 6: renderCircuit(state); break;
      default:
        area().replaceChildren(el(
          "p", "loading-error", "Etapa nu este recunoscută."
        ));
    }
  }

  async function loadLeaderboard() {
    try {
      const entries = await api("/leaderboard");
      const list = $("leaderboard-list");
      list.replaceChildren();

      $("leaderboard-status").textContent = entries.length
        ? "Cel mai bun rezultat al fiecărui nume."
        : "Încă nu există rezultate înregistrate.";

      entries.forEach((entry, index) => {
        const item = el("li", "leaderboard-item");
        item.appendChild(el("span", "leaderboard-rank", `#${index + 1}`));

        const info = el("span", "leaderboard-player");
        info.appendChild(el("strong", "", entry.name));
        info.appendChild(el(
          "small", "",
          entry.completed ? "Misiune completată" : `Etape: ${entry.stages}/6`
        ));

        item.appendChild(info);
        item.appendChild(el(
          "span", "leaderboard-score",
          `${entry.stages}/6 · ${entry.mistakes} greșeli · ${entry.seconds}s`
        ));

        list.appendChild(item);
      });
    } catch (error) {
      $("leaderboard-status").textContent =
        "Clasamentul nu este disponibil momentan.";
    }

    try {
      const status = await api("/ml-status");
      $("ml-status").textContent = status.trained_on_real_data
        ? `Antrenat pe ${status.samples} sesiuni. ${status.message}`
        : status.message;
    } catch (_) {
      $("ml-status").textContent = "Starea modelului nu este disponibilă.";
    }
  }

  async function refreshState() {
    if (loading || busy) return;
    loading = true;

    try {
      const state = await api("/state");

      if (
        currentState &&
        state.stage === 2 &&
        currentState.stage === 2 &&
        state.bomb_phase === currentState.bomb_phase &&
        JSON.stringify(state.bomb_sequence) ===
          JSON.stringify(currentState.bomb_sequence) &&
        JSON.stringify(state.bomb_input) ===
          JSON.stringify(currentState.bomb_input)
      ) {
        currentState = state;
        updateBombTimer(state);
      } else {
        render(state);
      }
    } catch (error) {
      console.error(error);
    } finally {
      loading = false;
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);

    pollTimer = setInterval(() => {
      if (currentState && currentState.stage === 2) {
        updateBombTimer(currentState);
        refreshState();
      }
    }, 500);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    $("hint-button").addEventListener(
      "click", () => sendAction({ type: "hint" })
    );

    $("restart-button").addEventListener(
      "click", () => sendAction({ type: "restart" })
    );

    $("refresh-leaderboard").addEventListener("click", loadLeaderboard);

    document.addEventListener("keydown", (event) => {
      if (event.target instanceof HTMLInputElement) return;

      const directions = {
        ArrowUp: "up", ArrowDown: "down",
        ArrowLeft: "left", ArrowRight: "right"
      };

      const direction = directions[event.key];
      if (!direction || !currentState || busy) return;

      if (currentState.stage === 1) {
        event.preventDefault();
        sendAction({ type: "maze_move", direction });
      } else if (currentState.stage === 4) {
        event.preventDefault();
        sendAction({ type: "grid_move", direction });
      }
    });

    try {
      render(await api("/state"));
    } catch (error) {
      showError(error);
      area().replaceChildren(el(
        "p", "loading-error",
        "Nu am putut încărca jocul. Verifică logurile serverului."
      ));
    }

    loadLeaderboard();
    startPolling();
  });
})();
