
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
        "Memorează simbolurile afișate, apoi selectează-le în aceeași ordine."
      )
    );

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
        (state.bomb_input || []).join(" ") || "? ? ?";
    }

    left.appendChild(display);

    const timer = el("p", "timer", "");
    left.appendChild(timer);

    const right = el("div", "stage-instructions");

    right.appendChild(
      el(
        "p",
        "",
        state.bomb_phase === "show"
          ? "Secvența este vizibilă pentru câteva secunde."
          : "Selectează simbolurile înainte să expire timpul."
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
        "Alege culorile în ordinea corectă. O alegere greșită resetează secvența."
      )
    );

    const progress = el(
      "p",
      "memory-progress",
      `Progres: ${(state.wire_input || []).length} / ${(state.wire_target || []).length}`
    );

    panel.appendChild(progress);

    const colors = state.colors || [];

    const palette = {
      "Albastru": "#4ea5ff",
      "Galben": "#f5cf54",
      "Mov": "#b49aff",
      "Verde": "#58d6a0",
      "Roșu": "#ff6f83"
    };

    const target = el("div", "wire-target");

    target.appendChild(el("p", "", "Ordinea de conectare:"));

    (state.wire_target || []).forEach(
      (colorIndex, position) => {
        const label = el(
          "span",
          "wire-target-chip",
          `${position + 1}. ${colors[colorIndex] || "?"}`
        );

        label.style.borderColor =
          palette[colors[colorIndex]] || "#58e0e6";

        target.appendChild(label);
      }
    );

    panel.appendChild(target);

    const buttons = el("div", "wire-buttons");

    colors.forEach((name, index) => {
      const b = button(
        name,
        "wire-button",
        () => sendAction({
          type: "wire_pick",
          color: index
        })
      );

      b.style.borderLeft =
        `5px solid ${palette[name] || "#58e0e6"}`;

      if ((state.wire_input || []).includes(index)) {
        b.classList.add("done");
      }

      buttons.appendChild(b);
    });

    panel.appendChild(buttons);
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
    if (tile.kind === "straight") {
      return tile.rotation % 2 === 0 ? "│" : "─";
    }

    return ["└", "┌", "┐", "┘"][tile.rotation % 4];
  }

  function renderCircuit(state) {
    const wrap = el("div", "circuit-wrap");

    wrap.appendChild(
      el(
        "p",
        "stage-instructions",
        "Rotește piesele până când energia ajunge de la sursa din stânga-sus la ieșirea din dreapta-jos."
      )
    );

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

      b.title =
        index === 0
          ? "Sursă"
          : index === 15
            ? "Ieșire"
            : `Piesa ${index + 1}`;

      grid.appendChild(b);
    });

    wrap.appendChild(grid);

    wrap.appendChild(
      el(
        "p",
        "circuit-caption",
        "Verde = sursă · Mov = ieșire · Apasă o piesă pentru a o roti."
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

    $("stage-name").textContent =
      state.stage_name || "RoboScape";

    $("feedback").textContent =
      state.feedback || "Continuă misiunea.";

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
    if (pollTimer) {
      clearInterval(pollTimer);
    }

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
