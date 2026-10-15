class Rule:
    """
    Represents an evolution/communication rule:
    LHS (consumed objects) -> RHS (produced objects) [target]
    Target can be: 'here', 'out' (to parent), or membrane label.
    """
    def __init__(self, lhs, rhs, target='here', condition=None):
        self.lhs = lhs  # dict of {obj: count}
        self.rhs = rhs  # dict of {obj: count}
        self.target = target  # 'here', 'out', or specific child/parent label
        self.condition = condition  # Optional lambda function for advanced guards

    def is_applicable(self, membrane):
        for obj, count in self.lhs.items():
            if membrane.get_count(obj) < count:
                return False
        if self.condition and not self.condition(membrane):
            return False
        return True

    def apply(self, membrane, system):
        # Consume LHS objects
        for obj, count in self.lhs.items():
            membrane.remove_object(obj, count)
        
        # Produce RHS objects to target destination
        target_membrane = self.resolve_target(membrane, system)
        for obj, count in self.rhs.items():
            target_membrane.add_object(obj, count)

    def resolve_target(self, current_membrane, system):
        if self.target == 'here':
            return current_membrane
        elif self.target == 'out':
            return current_membrane.parent if current_membrane.parent else current_membrane
        else:
            return system.find_membrane(self.target)