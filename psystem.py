"""
psystem.py — Maximally-parallel, nondeterministic P-System engine.
"""
import random


class DivisionRule:
    """
    Active-membrane division rule.
    When trigger_obj is present, the membrane splits into two daughters.
    daughter_a_objects / daughter_b_objects are *additional* objects
    placed into each daughter (on top of the surviving objects).
    """
    def __init__(self, name, trigger_obj, daughter_a_objects, daughter_b_objects, condition=None):
        self.name               = name
        self.trigger_obj        = trigger_obj
        self.daughter_a_objects = daughter_a_objects
        self.daughter_b_objects = daughter_b_objects
        self.condition          = condition

    @property
    def lhs(self):
        return {self.trigger_obj: 1}

    def is_applicable(self, membrane):
        if membrane.get_count(self.trigger_obj) < 1:
            return False
        if self.condition and not self.condition(membrane):
            return False
        return True

    def apply(self, membrane, system, log):
        base = dict(membrane.objects)
        base[self.trigger_obj] = base.get(self.trigger_obj, 0) - 1
        if base[self.trigger_obj] <= 0:
            del base[self.trigger_obj]

        a = dict(base)
        for obj, cnt in self.daughter_a_objects.items():
            a[obj] = a.get(obj, 0) + cnt

        b = dict(base)
        for obj, cnt in self.daughter_b_objects.items():
            b[obj] = b.get(obj, 0) + cnt

        da, db = membrane.divide(a, b, log)
        system._on_division(da, db, membrane)

    def meta(self):
        return {
            "name": self.name, "type": "division",
            "trigger": self.trigger_obj,
            "daughter_a": self.daughter_a_objects,
            "daughter_b": self.daughter_b_objects,
        }


class PSystem:
    def __init__(self, root_membrane):
        self.root    = root_membrane
        self.rules   = []   # list of (membrane_label, rule)
        self.history = []

    def add_rule(self, membrane_label, rule):
        self.rules.append((membrane_label, rule))

    # ── Membrane lookup ───────────────────────────────────────────────────────

    def find_membrane(self, label, current=None):
        if current is None: current = self.root
        if not current.alive: return None
        if current.label == label: return current
        for child in current.children:
            res = self.find_membrane(label, child)
            if res: return res
        return None

    def find_all_membranes(self, label, current=None, result=None):
        if current is None: current = self.root
        if result is None:  result  = []
        if not current.alive: return result
        if current.label == label: result.append(current)
        for child in current.children:
            self.find_all_membranes(label, child, result)
        return result

    def _all_living(self, current=None, result=None):
        if current is None: current = self.root
        if result  is None: result  = []
        if not current.alive: return result
        result.append(current)
        for child in current.children: self._all_living(child, result)
        return result

    def _on_division(self, da, db, old_parent):
        pass   # label stays same; find_all_membranes picks up daughters

    # ── Maximally-parallel step ───────────────────────────────────────────────

    def step(self, step_num):
        """
        Collect all applicable (membrane, rule) pairs, shuffle for
        nondeterminism, greedily select a maximal non-conflicting set,
        then apply all simultaneously.
        """
        log = []
        candidates = []
        for mem in self._all_living():
            for label, rule in self.rules:
                if mem.label == label and rule.is_applicable(mem):
                    candidates.append((mem, rule))

        if not candidates:
            return False, []

        random.shuffle(candidates)

        reserved = {}   # mem_id → {obj: reserved_count}
        selected  = []
        for mem, rule in candidates:
            mid = mem.mem_id
            if mid not in reserved: reserved[mid] = {}
            lhs = rule.lhs
            ok  = all(
                mem.get_count(obj) - reserved[mid].get(obj, 0) >= cnt
                for obj, cnt in lhs.items()
            )
            if ok:
                for obj, cnt in lhs.items():
                    reserved[mid][obj] = reserved[mid].get(obj, 0) + cnt
                selected.append((mem, rule))

        for mem, rule in selected:
            if mem.alive:
                rule.apply(mem, self, log)

        snapshot = self.root.snapshot()
        self.history.append({"step": step_num, "events": log, "tree": snapshot})
        return True, log

    def run(self, max_steps=20):
        self.history = [{"step": 0, "events": [], "tree": self.root.snapshot()}]
        for i in range(1, max_steps + 1):
            ok, _ = self.step(i)
            if not ok:
                break
        return self.history

    def rules_meta(self):
        out = []
        for label, rule in self.rules:
            m = rule.meta() if hasattr(rule, 'meta') else {
                "name": rule.name, "type": "evolution",
                "lhs": rule.lhs, "rhs": rule.rhs, "target": rule.target
            }
            m["applies_to"] = label
            out.append(m)
        return out
