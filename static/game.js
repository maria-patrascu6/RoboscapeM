let currentState = null;
let loading = false;
let busy = false;

async function getState() {
    const response = await fetch("/state");
    if (!response.ok) {
        throw new Error("Nu s-a putut obtine starea jocului.");
    }
    return response.json();
}

async function sendAction(action) {
    if (busy) return;

    busy = true;

    try {
        const response = await fetch("/action", {
            method: "POST",
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
        console.error(error);
    } finally {
        busy = false;
    }
}

function updateBombTimer(state) {
    const timer = document.querySelector(".timer");

    if (!timer || Number(state.stage) !== 2) return;

    const showing = state.bomb_phase === "show";
    const deadline = showing
        ? state.bomb_show_until
        : state.bomb_deadline;

    const remaining = Math.max(
        0,
        Math.ceil((Number(deadline) || 0) - Date.now() / 1000)
    );

    timer.textContent = showing
        ? "MEMOREAZA: " + remaining + " s"
        : "TIMP RAMAS: " + remaining + " s";

    timer.classList.toggle("timer-warning", remaining <= 5);
}

async function refreshState() {
    if (loading || busy) return;

    loading = true;

    try {
        const previous = currentState;
        const state = await getState();

        const sameBombPhase =
            previous &&
            Number(previous.stage) === 2 &&
            Number(state.stage) === 2 &&
            previous.bomb_phase === state.bomb_phase &&
            JSON.stringify(previous.bomb_input || []) ===
                JSON.stringify(state.bomb_input || []) &&
            JSON.stringify(previous.bomb_sequence || []) ===
                JSON.stringify(state.bomb_sequence || []) &&
            previous.feedback === state.feedback &&
            previous.status === state.status;

        if (sameBombPhase) {
            currentState = state;
            updateBombTimer(state);
        } else {
            render(state);
        }
    } catch (error) {
        console.error("Eroare la actualizarea jocului:", error);
    } finally {
        loading = false;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const hintButton = document.getElementById("hint-button");
    const restartButton = document.getElementById("restart-button");

    if (hintButton) {
        hintButton.addEventListener("click", () => {
            sendAction({ type: "hint" });
        });
    }

    if (restartButton) {
        restartButton.addEventListener("click", () => {
            sendAction({ type: "restart" });
        });
    }

    refreshState();

    setInterval(() => {
        if (currentState && Number(currentState.stage) === 2) {
            refreshState();
        }
    }, 500);
});
