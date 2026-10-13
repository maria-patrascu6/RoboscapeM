
(() => {
  "use strict";

  let currentState = null;
  let busy = false;
  let polling = false;
  let pollTimer = null;

  const $ = (id) => document.getElementById(id);
  const area = () => $("game-area");

  async function api(url, options = {}) {
    const response = await fetch(url, {
      cache: "no-store",
      ...options
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `Eroare HTTP ${response.status}`);
    }

    return data;
  }

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) {
      node.textContent = text;
    }
    return node;
  }

  function button(text, className, callback) {
    const node = el("button", className, text);
    node.type = "button";
    node.addEventListener("click", callback);
    return node;
  }

  function showError(error) {
    console.error("RoboScape:", error);
    $("feedback").textContent = error.message || "A apărut o eroare.";
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
        await loadLeaderboard();
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
    ).forEach((node) => {
      node.disabled = disabled;
    });
  }

  function renderNameScreen() {
    const wrap = el("div", "name-screen");
    wrap.appendChild(el("div", "name-robot", "🤖"));
    wrap.appendChild(el("h3", "", "Următorul jucător"));
    wrap.appendChild(el(
      "p", "stage-instructions",
      "Introdu un nume sau o poreclă pentru o misiune nouă."
    ));

    const form = el("form", "name-form");
    const input = el("input");
    input.type = "text";
    input.name = "player-name";
    input.minLength = 2;
    input.maxLength = 30;
    input.required = true;
    input.autocomplete = "off";
    input.placeholder = "Numele sau porecla";
    input.setAttribute("aria-label", "Numele jucătorului");

    const submit = el("button", "primary-button", "Începe misiunea");
    submit.type = "submit";

    const error = el("p", "name-error");
    error.setAttribute("aria-live", "polite");
    form.append(input, submit);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const name = input.value.trim().replace(/\s+/g, " ");
      if (name.length < 2) {
        error.textContent = "Introdu cel puțin două caractere.";
        return;
      }

      submit.disabled = true;

      try {
        const state = await api("/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name })
        });

        render(state);
        await loadLeaderboard();
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
    $("stage-label").textContent = "MISIUNE NOUĂ";
    $("stage-name").textContent = "Înregistrarea jucătorului";
    $("feedback").textContent = "Fiecare jucător începe de la zero.";
  }

  function addMoveControls(parent, type) {
    const pad = el("div", "control-pad");

    [
      ["", ""], ["up", "↑"], ["", ""],
      ["left", "←"], ["down", "↓"], ["right", "→"]
    ].forEach(([direction, label]) => {
      if (!direction) {
        pad.appendChild(el("span", "empty"));
      } else {
        const b = button(label, "maze-control", () =>
          sendAction({ type, direction })
        );
        b.setAttribute("aria-label", direction);
        pad.appendChild(b);
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
        } else if (pos[0] === r && pos[1] === c) {
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
      "Ajungi la ieșirea din colțul din dreapta-jos. Evită pereții."
    ));
    addMoveControls(controls, isGrid ? "grid_move" : "maze_move");
    controls.appendChild(el("p", "maze-help", "Poți folosi tastele săgeți."));

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
      0,
      Math.ceil((Number(deadline) || 0) - Date.now() / 1000)
    );

    timer.textContent = showing
      ? `Memorează formele: ${seconds} s`
      : `Timp rămas: ${seconds} s`;

    timer.classList.toggle("timer-warning", !showing && seconds <= 5);
  }

  function renderBomb(state) {
    const wrap = el("div", "bomb-panel");
    const left = el("div", "stage-instructions");

    left.appendChild(el(
      "p", "",
      "Memorează formele de la stânga la dreapta. Apoi apasă-le în aceeași ordine."
    ));

    const illustration = el("div", "bomb-illustration");
    const shell = el("div", "bomb-shell");
    shell.appendChild(el("span", "bomb-light"));
    shell.appendChild(el("span", "bomb-label", "MEMORY CORE"));
    shell.appendChild(el(
      "span", "bomb-display-small",
      state.bomb_phase === "show" ? "MEM" : "INPUT"
    ));
    illustration.appendChild(shell);
    left.appendChild(illustration);

    const display = el("div", "bomb-display");

    if (state.bomb_phase === "show") {
      (state.bomb_sequence || []).forEach((symbol) => {
        display.appendChild(el("span", "memory-shape", symbol));
      });
    } else {
      display.textContent =
        (state.bomb_input || []).join("  ") || "Începe secvența";
    }

    left.append(display, el("p", "timer"));

    const right = el("div", "stage-instructions");
    right.appendChild(el(
      "p", "",
      state.bomb_phase === "show"
        ? "Reține toate formele înainte să dispară."
        : "Introdu secvența fără să schimbi ordinea."
    ));

    if (state.bomb_phase === "input") {
      const grid = el("div", "symbol-buttons");

      (state.symbols || []).forEach((symbol) => {
        grid.appendChild(button(
          symbol,
          "symbol-button",
          () => sendAction({ type: "bomb_pick", symbol })
        ));
      });

      right.appendChild(grid);
    }

    right.appendChild(el(
      "p", "memory-progress",
      `Forme introduse: ${(state.bomb_input || []).length} / ${
        state.bomb_sequence?.length || "?"
      }`
    ));

    wrap.append(left, right);
    area().replaceChildren(wrap);
    updateBombTimer(state);
  }

  function renderWires(state) {
    const panel = el("div", "wire-panel");
    panel.appendChild(el(
      "p", "stage-instructions",
      "Selectează două cabluri pentru a le schimba pozițiile. Pune-le în ordinea culorilor."
    ));

    const colors = state.colors || [];
    const order = (state.wire_target || []).slice();
    const names = {
      Albastru: "#4ea5ff",
      Galben: "#f5cf54",
      Mov: "#b49aff",
      Verde: "#58d6a0",
      Roșu: "#ff6f83"
    };

    const list = el("div", "wire-list");
    let selected = null;

    function draw() {
      list.replaceChildren();

      order.forEach((wireId, slot) => {
        const name = colors[wireId];
        const b = button(
          `${slot + 1}. ${name}`,
          "wire-choice",
          () => {
            if (selected === null) {
              selected = slot;
            } else {
              [order[selected], order[slot]] =
                [order[slot], order[selected]];
              selected = null;
            }
            draw();
          }
        );

        b.style.borderLeftColor = names[name] || "#fff";
        b.classList.toggle("selected", selected === slot);
        list.appendChild(b);
      });
    }

    draw();
    panel.appendChild(list);
    panel.appendChild(el(
      "p", "memory-progress",
      "Ordinea corectă este afișată prin culorile cablurilor din stânga spre dreapta."
    ));

    panel.appendChild(button(
      "Verifică ordinea",
      "primary-button",
      () => {
        if (order.every((id, index) => id === index)) {
          sendAction({ type: "wire_solved" });
        } else {
          sendAction({ type: "wire_wrong" });
        }
      }
    ));

    area().replaceChildren(panel);
  }

  function renderLogic(state) {
    const box = el("div", "logic-box");
    box.appendChild(el("p", "logic-question", state.logic_question));
    box.appendChild(el(
      "p", "stage-instructions",
      "Introdu numărul care completează șirul."
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

  function renderCircuit(state) {
    const wrap = el("div", "circuit-wrap");
    wrap.appendChild(el(
      "p", "stage-instructions",
      "Rotește piesele până când poți traversa circuitul de la sursă la ieșire."
    ));

    const legend = el("div", "circuit-legend");
    legend.appendChild(el("span", "source-label", "⚡ SURSA"));
    legend.appendChild(el("span", "exit-label", "◎ IEȘIRE"));
    wrap.appendChild(legend);

    const grid = el("div", "circuit-grid");
    const ns = "http://www.w3.org/2000/svg";

    function addSvg(parent, tag, attrs) {
      const node = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([key, value]) => {
        node.setAttribute(key, value);
      });
      parent.appendChild(node);
      return node;
    }

    function ports(tile) {
      if (tile.kind === "straight") {
        return tile.rotation % 2 === 0 ? ["N", "S"] : ["E", "W"];
      }

      return [
        ["N", "E"],
        ["E", "S"],
        ["S", "W"],
        ["W", "N"]
      ][tile.rotation % 4];
    }

    function drawTile(tile, index) {
      const b = button("", "circuit-tile", () =>
        sendAction({ type: "circuit_rotate", index })
      );

      b.setAttribute("aria-label", `Rotește piesa ${index + 1}`);

      if (index === 0) b.classList.add("source");
      if (index === 15) b.classList.add("exit");

      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("aria-hidden", "true");

      const endpoints = {
        N: [50, 5],
        E: [95, 50],
        S: [50, 95],
        W: [5, 50]
      };

      ports(tile).forEach((port) => {
        const [x, y] = endpoints[port];

        addSvg(svg, "line", {
          x1: 50,
          y1: 50,
          x2: x,
          y2: y,
          stroke: "#58e0e6",
          "stroke-width": 15,
          "stroke-linecap": "round"
        });
      });

      addSvg(svg, "circle", {
        cx: 50, cy: 50, r: 10, fill: "#d8faff"
      });

      b.appendChild(svg);
      return b;
    }

    (state.circuit || []).forEach((tile, index) => {
      grid.appendChild(drawTile(tile, index));
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
      "p", "",
      state.feedback || "Ai reușit să evadezi de pe navă."
    ));
    box.appendChild(el(
      "p", "",
      `Etape: ${state.successes} · Greșeli: ${state.mistakes} · Indicii: ${state.hints}`
    ));
    box.appendChild(button(
      "Următorul jucător",
      "primary-button",
      () => sendAction({ type: "restart" })
    ));
    area().replaceChildren(box);
  }

  function render(state) {
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
        area().replaceChildren(el("p", "loading-error", "Etapă necunoscută."));
    }
  }

  async function loadLeaderboard() {
    try {
      const entries = await api("/leaderboard");
      const list = $("leaderboard-list");
      list.replaceChildren();

      $("leaderboard-status").textContent = entries.length
        ? "Cel mai bun rezultat pentru fiecare nume."
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
        "Nu am putut încărca clasamentul.";
    }

    try {
      const status = await api("/ml-status");
      $("ml-status").textContent = status.message;
    } catch (_) {
      $("ml-status").textContent = "Starea modelului nu este disponibilă.";
    }
  }

  async function pollBomb() {
    if (polling || busy || !currentState || currentState.stage !== 2) return;

    polling = true;

    try {
      const state = await api("/state");

      if (state.needs_name) {
        render(state);
      } else if (
        !currentState ||
        state.stage !== currentState.stage ||
        state.bomb_phase !== currentState.bomb_phase ||
        JSON.stringify(state.bomb_input) !==
          JSON.stringify(currentState.bomb_input)
      ) {
        render(state);
      } else {
        currentState = state;
        updateBombTimer(state);
      }
    } catch (error) {
      console.error(error);
    } finally {
      polling = false;
    }
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
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right"
      };

      const direction = directions[event.key];
      if (!direction || !currentState || busy) return;

      if (currentState.stage === 1 || currentState.stage === 4) {
        event.preventDefault();
        sendAction({
          type: currentState.stage === 1 ? "maze_move" : "grid_move",
          direction
        });
      }
    });

    try {
      render(await api("/state"));
    } catch (error) {
      showError(error);
    }

    await loadLeaderboard();
    pollTimer = setInterval(pollBomb, 500);
  });
})();
