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

    def step(self, step_num):
        print(f"\n----------------------------------------")
        print(f"🔄 [STEP {step_num}] Beginning parallel rule evaluation cycle...")
        print(f"----------------------------------------")
        
        applied_any = False
        # Iterate over all rules registered in the system
        for mem_label, rule in self.rules:
            mem = self.find_membrane(mem_label)
            if mem:
                print(f"   Checking Rule '{rule.name}' inside Membrane '{mem_label}'...")
                if rule.is_applicable(mem):
                    print(f"   ✅ Rule '{rule.name}' is APPLICABLE.")
                    rule.apply(mem, self)
                    applied_any = True
                else:
                    print(f"   ❌ Rule '{rule.name}' is NOT applicable (missing objects or guard failed).")
            else:
                print(f"   ⚠️ Warning: Membrane '{mem_label}' not found for rule '{rule.name}'.")
                
        return applied_any

    def run(self, max_steps=10):
        print("🚀 P System execution started.")
        step_count = 1
        while step_count <= max_steps:
            progress = self.step(step_count)
            if not progress:
                print(f"\n🛑 [HALT] No rules were fired in Step {step_count}. P System has reached a halting configuration.")
                break
            step_count += 1