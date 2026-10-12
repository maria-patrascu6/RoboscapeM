
const gameArea = document.getElementById("gameArea");

async function sendAction(command, extra = {}) {
    const response = await fetch("/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, ...extra })
    });

    const state = await response.json();
    renderGame(state);
}

async function loadGame() {
    const response = await fetch("/state");
    renderGame(await response.json());
}

function renderGame(state) {
    document.getElementById("stage").textContent =
        state.finished ? "✓" : state.stage;

    document.getElementById("difficulty").textContent =
        state.difficulty + "/3";

    document.getElementById("mistakes").textContent = state.mistakes;
    document.getElementById("hints").textContent = state.hints;
    document.getElementById("stageName").textContent =
        state.stage_name.toUpperCase();
    document.getElementById("description").textContent =
        state.description;
    document.getElementById("message").textContent = state.message;

    document.getElementById("hintButton").disabled = state.finished;

    if (state.finished) {
        gameArea.innerHTML = `
            <div class="completion">
                <h2>🚀 Misiune îndeplinită!</h2>
                <p>Ai trecut prin toate cele patru etape ale RoboScape.</p>
                <p>CORE: Felicitări, exploratorule!</p>
            </div>`;
        return;
    }

    if (state.stage === 1) {
        renderMaze(state);
    } else {
        renderPuzzle(state);
    }
}

function renderMaze(state) {
    let html = '<div class="maze">';

    for (let row = 0; row < state.maze.length; row++) {
        for (let col = 0; col < state.maze[row].length; col++) {
            const isWall = state.maze[row][col] === 1;
            const isPlayer = row === state.x && col === state.y;
            const isExit = row === 4 && col === 4;

            let classes = "cell";
            if (isWall) classes += " wall";
            if (isExit) classes += " exit";

            let symbol = "";
            if (isPlayer) symbol = "🤖";
            else if (isExit) symbol = "🚪";
            else if (isWall) symbol = "▪";

            html += `<div class="${classes}">${symbol}</div>`;
        }
    }

    html += '</div>';
    html += `
        <div class="controls">
            <span></span>
            <button data-direction="up" aria-label="Sus">↑</button>
            <span></span>
            <button data-direction="left" aria-label="Stânga">←</button>
            <button data-direction="down" aria-label="Jos">↓</button>
            <button data-direction="right" aria-label="Dreapta">→</button>
        </div>
        <p style="text-align:center">Ghidează robotul spre ușa de ieșire.</p>`;

    gameArea.innerHTML = html;

    gameArea.querySelectorAll("[data-direction]").forEach(button => {
        button.addEventListener("click", () => {
            sendAction("move", {
                direction: button.dataset.direction
            });
        });
    });
}

function renderPuzzle(state) {
    gameArea.innerHTML = `
        <div class="puzzle">
            <h3>${state.puzzle}</h3>
            <form id="answerForm">
                <label for="answerInput">Răspunsul tău:</label><br>
                <input
                    id="answerInput"
                    name="answer"
                    type="number"
                    required
                    autocomplete="off"
                >
                <br>
                <button type="submit">Verifică răspunsul</button>
            </form>
        </div>`;

    document.getElementById("answerForm").addEventListener("submit", event => {
        event.preventDefault();

        const answer = document.getElementById("answerInput").value;
        sendAction("answer", { answer });
    });
}

document.getElementById("hintButton").addEventListener("click", () => {
    sendAction("hint");
});

document.getElementById("restartButton").addEventListener("click", async () => {
    const response = await fetch("/restart", { method: "POST" });
    renderGame(await response.json());
});

loadGame();
