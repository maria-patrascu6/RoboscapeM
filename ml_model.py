
"""Model demonstrativ pentru adaptarea dificultății jocului."""

import numpy as np
from sklearn.ensemble import RandomForestClassifier

TRAINING_DATA = np.array([
    [0, 0, 0], [1, 0, 0], [2, 1, 0], [4, 2, 0],
    [5, 3, 0], [3, 2, 1], [2, 1, 2], [1, 0, 3],
    [0, 0, 4], [6, 4, 0], [5, 2, 1], [4, 1, 2],
    [3, 1, 3], [2, 0, 4], [1, 1, 4], [0, 0, 5],
    [7, 4, 1], [6, 3, 2], [1, 0, 1], [3, 0, 2],
    [0, 1, 3]
], dtype=float)

TRAINING_LABELS = np.array([
    3, 3, 2, 1, 1, 1, 2, 3, 3, 1, 1,
    2, 2, 3, 3, 3, 1, 1, 3, 2, 3
])

MODEL = RandomForestClassifier(
    n_estimators=60,
    max_depth=5,
    random_state=42
)

MODEL.fit(TRAINING_DATA, TRAINING_LABELS)


def predict_difficulty(mistakes, hints, successes):
    features = np.array([[
        min(max(int(mistakes), 0), 20),
        min(max(int(hints), 0), 10),
        min(max(int(successes), 0), 20)
    ]], dtype=float)

    return int(MODEL.predict(features)[0])
