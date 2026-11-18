"""
api.py — Clean fluent API for building and running P-Systems.

Usage example:
    from api import PSystemAPI

    api = PSystemAPI("My System")
    skin = api.skin()
    gen  = api.child(skin, "gen", objects={"d1": 1})

    api.division_rule("gen", trigger="d1",
                      daughter_a={"yes_1": 1, "d2": 1},
                      daughter_b={"no_1":  1, "d2": 1})

    api.evolution_rule("gen", name="Evaluate",
                       lhs={"eval": 1}, rhs={"solution": 1},
                       target="out", condition=my_guard)

    api.run(max_steps=10)
    api.export("simulation_data.json")
"""

import json
from membrane import Membrane
from rule      import Rule
from psystem   import PSystem, DivisionRule


class PSystemAPI:
    def __init__(self, title="P-System"):
        self.title   = title
        self._root   = None
        self._system = None
        self._rules  = []   # deferred (label, rule) pairs

    # ── Structure builders ────────────────────────────────────────────────────

    def skin(self, objects=None):
        """Create the outermost (skin) membrane."""
        m = Membrane("skin")
        if objects:
            for obj, cnt in objects.items():
                m.add_object(obj, cnt)
        self._root = m
        return m

    def child(self, parent, label, objects=None):
        """Create a child membrane inside *parent*."""
        m = Membrane(label, parent)
        if objects:
            for obj, cnt in objects.items():
                m.add_object(obj, cnt)
        parent.add_child(m)
        return m

    # ── Rule builders ─────────────────────────────────────────────────────────

    def evolution_rule(self, membrane_label, name, lhs, rhs,
                       target='here', condition=None):
        """Add an evolution/communication rule to *membrane_label*."""
        self._rules.append((membrane_label,
                            Rule(name, lhs, rhs, target, condition)))
        return self

    def division_rule(self, membrane_label, trigger,
                      daughter_a, daughter_b,
                      name=None, condition=None):
        """Add a membrane-division rule to *membrane_label*."""
        rule_name = name or f"Divide_{trigger}_in_{membrane_label}"
        self._rules.append((membrane_label,
                            DivisionRule(rule_name, trigger,
                                         daughter_a, daughter_b,
                                         condition)))
        return self

    # ── Execution ─────────────────────────────────────────────────────────────

    def run(self, max_steps=20):
        """Build the PSystem and run the simulation."""
        assert self._root, "Call skin() first."
        self._system = PSystem(self._root)
        for label, rule in self._rules:
            self._system.add_rule(label, rule)
        self._history = self._system.run(max_steps)
        return self

    # ── Export ────────────────────────────────────────────────────────────────

    def export(self, filename="simulation_data.json", metadata=None):
        """Write the full simulation data to *filename* for the visualizer."""
        assert hasattr(self, '_history'), "Call run() before export()."
        data = {
            "title":    self.title,
            "rules":    self._system.rules_meta(),
            "steps":    self._history,
            "metadata": metadata or {},
        }
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        print(f"✅ Exported {len(self._history)} steps → {filename}")
        return self

    # ── Convenience properties ────────────────────────────────────────────────

    @property
    def result_count(self):
        """Number of 'solution' objects collected in the skin membrane."""
        return self._root.get_count("solution")

    @property
    def history(self):
        return self._history
