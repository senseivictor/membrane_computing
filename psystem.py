class PSystem:
    def __init__(self, root_membrane):
        self.root = root_membrane
        self.rules = []  # List of (membrane_label, Rule) tuples

    def add_rule(self, membrane_label, rule):
        self.rules.append((membrane_label, rule))

    def find_membrane(self, label, current=None):
        if current is None:
            current = self.root
        if current.label == label:
            return current
        for child in current.children:
            res = self.find_membrane(label, child)
            if res:
                return res
        return None

    def step(self):
        """Execute one step of maximally parallel rule application."""
        applied_any = False
        for mem_label, rule in self.rules:
            mem = self.find_membrane(mem_label)
            if mem and rule.is_applicable(mem):
                rule.apply(mem, self)
                applied_any = True
        return applied_any

    def run(self, max_steps=100):
        step_count = 0
        while step_count < max_steps:
            progress = self.step()
            if not progress:
                break
            step_count += 1