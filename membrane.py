"""
membrane.py — P-System membrane with unique IDs, division, and dissolution.
"""

_id_counter = 0

def _next_id(label):
    global _id_counter
    _id_counter += 1
    return f"{label}#{_id_counter}"


class Membrane:
    def __init__(self, label, parent=None, slot_idx=0, slot_count=1):
        self.label      = label
        self.mem_id     = _next_id(label)
        self.parent     = parent
        self.children   = []
        self.objects    = {}
        self.alive      = True
        self.slot_idx   = slot_idx
        self.slot_count = slot_count

    # ── Multiset ──────────────────────────────────────────────────────────────

    def add_object(self, obj, count=1):
        self.objects[obj] = self.objects.get(obj, 0) + count

    def remove_object(self, obj, count=1):
        if self.objects.get(obj, 0) >= count:
            self.objects[obj] -= count
            if self.objects[obj] == 0:
                del self.objects[obj]
            return True
        return False

    def get_count(self, obj):
        return self.objects.get(obj, 0)

    # ── Structure ─────────────────────────────────────────────────────────────

    def add_child(self, child):
        child.parent = self
        self.children.append(child)

    def dissolve(self, log):
        """Push all objects + children to parent, mark dead."""
        if not self.parent:
            return
        log.append({
            "event": "membrane_dissolved",
            "membrane_id": self.mem_id,
            "membrane_label": self.label,
            "objects_released": dict(self.objects)
        })
        for obj, count in self.objects.items():
            self.parent.add_object(obj, count)
        for child in self.children:
            child.parent = self.parent
            self.parent.children.append(child)
        self.parent.children.remove(self)
        self.objects = {}
        self.children = []
        self.alive = False

    def divide(self, objects_a, objects_b, log):
        """
        Split self into two daughter membranes.
        Returns (daughter_a, daughter_b).
        """
        def _clone(src, new_parent):
            m = Membrane(src.label, new_parent, slot_idx=src.slot_idx, slot_count=src.slot_count)
            m.objects = dict(src.objects)
            for child in src.children:
                m.add_child(_clone(child, m))
            return m

        next_slot_count = self.slot_count * 2
        da = Membrane(self.label, self.parent, slot_idx=self.slot_idx * 2, slot_count=next_slot_count)
        da.objects = dict(objects_a)
        for child in self.children:
            da.add_child(_clone(child, da))

        db = Membrane(self.label, self.parent, slot_idx=self.slot_idx * 2 + 1, slot_count=next_slot_count)
        db.objects = dict(objects_b)
        for child in self.children:
            db.add_child(_clone(child, db))

        log.append({
            "event": "membrane_divided",
            "parent_id": self.mem_id,
            "parent_label": self.label,
            "daughter_a_id": da.mem_id,
            "daughter_b_id": db.mem_id,
            "daughter_a_objects": dict(objects_a),
            "daughter_b_objects": dict(objects_b),
        })

        idx = self.parent.children.index(self)
        self.parent.children[idx:idx+1] = [da, db]
        self.alive = False
        return da, db

    def _get_dna(self):
        genes = []
        for k in self.objects:
            if k.startswith('yes_'):
                idx = int(k.split('_')[1])
                genes.append({'item': idx, 'choice': True, 'label': f'✓{idx}'})
            elif k.startswith('no_'):
                idx = int(k.split('_')[1])
                genes.append({'item': idx, 'choice': False, 'label': f'✗{idx}'})
        genes.sort(key=lambda g: g['item'])
        return genes

    def snapshot(self):
        return {
            "id": self.mem_id,
            "label": self.label,
            "slotIdx": getattr(self, "slot_idx", 0),
            "slotCount": getattr(self, "slot_count", 1),
            "alive": self.alive,
            "dna": self._get_dna(),
            "objects": dict(self.objects),
            "children": [c.snapshot() for c in self.children]
        }

    def __repr__(self):
        return f"Membrane(id={self.mem_id!r}, objects={self.objects})"
