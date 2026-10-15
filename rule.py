class Rule:
    """
    Represents an evolution/communication rule with verbose tracing.
    """
    def __init__(self, name, lhs, rhs, target='here', condition=None):
        self.name = name  # Human-readable name for logging
        self.lhs = lhs    # Consumption pattern
        self.rhs = rhs    # Production pattern
        self.target = target  # 'here', 'out', or specific membrane label
        self.condition = condition  # Optional guard function

    def is_applicable(self, membrane):
        # 1. Check if multiset requirements (LHS) are met
        for obj, count in self.lhs.items():
            if membrane.get_count(obj) < count:
                return False
        
        # 2. Check optional custom guard condition
        if self.condition and not self.condition(membrane):
            return False
            
        return True

    def apply(self, membrane, system):
        print(f"\n⚡ [RULE FIRED: '{self.name}'] in Membrane '{membrane.label}'")
        print(f"   - Consuming LHS objects: {self.lhs}")
        
        # Consume LHS objects
        for obj, count in self.lhs.items():
            membrane.remove_object(obj, count)
        
        # Resolve target destination
        target_membrane = self.resolve_target(membrane, system)
        print(f"   - Producing RHS objects: {self.rhs} -> Target: '{target_membrane.label}'")
        
        # Produce RHS objects
        for obj, count in self.rhs.items():
            target_membrane.add_object(obj, count)

    def resolve_target(self, current_membrane, system):
        if self.target == 'here':
            return current_membrane
        elif self.target == 'out':
            return current_membrane.parent if current_membrane.parent else current_membrane
        else:
            return system.find_membrane(self.target)