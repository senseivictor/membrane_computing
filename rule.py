"""
rule.py — Evolution rule for P-Systems.
"""


class Rule:
    """
    Standard evolution/communication rule: u → v [target].
    target: 'here' | 'out' | '<membrane_label>'
    """
    def __init__(self, name, lhs, rhs, target='here', condition=None):
        self.name      = name
        self.lhs       = lhs       # {obj: count}
        self.rhs       = rhs       # {obj: count}
        self.target    = target
        self.condition = condition

    def is_applicable(self, membrane):
        for obj, cnt in self.lhs.items():
            if membrane.get_count(obj) < cnt:
                return False
        if self.condition and not self.condition(membrane):
            return False
        return True

    def apply(self, membrane, system, log):
        log.append({
            "event": "rule_fired",
            "rule":           self.name,
            "membrane_id":    membrane.mem_id,
            "membrane_label": membrane.label,
            "consumed":       dict(self.lhs),
            "produced":       dict(self.rhs),
            "target":         self.target,
        })
        for obj, cnt in self.lhs.items():
            membrane.remove_object(obj, cnt)
        dest = self._resolve(membrane, system)
        for obj, cnt in self.rhs.items():
            dest.add_object(obj, cnt)

    def _resolve(self, mem, system):
        if self.target == 'here':
            return mem
        if self.target == 'out':
            return mem.parent if mem.parent else mem
        return system.find_membrane(self.target) or mem

    def meta(self):
        return {
            "name": self.name, "type": "evolution",
            "lhs": self.lhs, "rhs": self.rhs, "target": self.target,
        }
