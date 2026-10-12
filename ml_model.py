
import numpy as np
from sklearn.ensemble import RandomForestClassifier


def train_model():
    # Date demonstrative pentru prototip.
    # Coloane: numar de greseli, numar de indicii.
    X = []
    y = []

    for mistakes in range(11):
        for hints in range(6):
            X.append([mistakes, hints])

            if mistakes >= 6 or hints >= 4:
                y.append(1)  # Mai usor
            elif mistakes >= 3 or hints >= 2:
                y.append(2)  # Mediu
            else:
                y.append(3)  # Mai dificil

    model = RandomForestClassifier(
        n_estimators=100,
        random_state=42
    )
    model.fit(np.array(X), np.array(y))
    return model


model = train_model()


def recommend_difficulty(mistakes, hints):
    prediction = model.predict([[mistakes, hints]])
    return int(prediction[0])
