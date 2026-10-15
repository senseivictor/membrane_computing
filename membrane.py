class Membrane:
    def __init__(self, label, parent=None):
        self.label = label
        self.parent = parent
        self.children = []
        self.objects = {}  # Multiset: dict of {object_name: count}

    def add_object(self, obj, count=1):
        self.objects[obj] = self.objects.get(obj, 0) + count
        print(f"   [MEMBRANE '{self.label}'] ➕ Added object: '{obj}' (count: {count}). Current state: {self.objects}")

    def remove_object(self, obj, count=1):
        if self.objects.get(obj, 0) >= count:
            self.objects[obj] -= count
            print(f"   [MEMBRANE '{self.label}'] ➖ Consumed/Removed object: '{obj}' (count: {count}).")
            if self.objects[obj] == 0:
                del self.objects[obj]
            return True
        print(f"   [MEMBRANE '{self.label}'] ❌ Failed to remove '{obj}' (requested {count}, available {self.objects.get(obj, 0)}).")
        return False

    def get_count(self, obj):
        return self.objects.get(obj, 0)

    def __repr__(self):
        return f"Membrane(label='{self.label}', Objects: {self.objects})"