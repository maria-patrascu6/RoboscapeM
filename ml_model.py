
from sklearn.tree import DecisionTreeClassifier

class DifficultyModel:
    def __init__(self):
        self.model = DecisionTreeClassifier(
            max_depth=3,
            random_state=42
        )

        self.X = []
        self.y = []
        self.trained = False

    def add_result(self, time_taken, mistakes, success):
        features = [
            min(float(time_taken), 300),
            min(int(mistakes), 20)
        ]

        # 0 = usor, 1 = mediu, 2 = greu
        if success and time_taken < 30 and mistakes == 0:
            difficulty = 2
        elif not success or mistakes >= 3 or time_taken > 90:
            difficulty = 0
        else:
            difficulty = 1

        self.X.append(features)
        self.y.append(difficulty)

        if len(self.X) >= 5 and len(set(self.y)) >= 2:
            self.model.fit(self.X, self.y)
            self.trained = True

    def predict(self, time_taken, mistakes):
        features = [[
            min(float(time_taken), 300),
            min(int(mistakes), 20)
        ]]

        if self.trained:
            return int(self.model.predict(features)[0])

        if mistakes >= 3 or time_taken > 90:
            return 0
        elif time_taken < 30 and mistakes == 0:
            return 2

        return 1


difficulty_model = DifficultyModel()


def difficulty_name(level):
    names = {
        0: "Ușor",
        1: "Mediu",
        2: "Greu"
    }
    return names.get(level, "Mediu")
