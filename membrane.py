class Membrane:
    def __init__(self, label, parent=None):
        self.label = label
        self.parent = parent
        self.children = []
        self.objects = {}  # Multiset: dict of {object_name: count}

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

    def __repr__(self):
        return f"Membrane({self.label}, Objects: {self.objects})"