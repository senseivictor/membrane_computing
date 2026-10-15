from membrane import Membrane
from rule import Rule
from psystem import PSystem

def solve_knapsack():
    print("=== INITIALIZING P SYSTEM KNAPSACK SOLVER ===")
    
    # 1. Setup Membrane Structure
    # Skin is the outer environment container
    skin = Membrane("skin")
    # Cell is the inner processing compartment
    cell = Membrane("cell", parent=skin)
    skin.children.append(cell)

    print(f"Created Membrane Hierarchy: [{skin.label} -> [{cell.label}]]")

    # Initial objects in the cell: 'start' triggers the generation phase
    cell.add_object("start", 1)

    # Knapsack Configuration: Capacity = 5
    # Item 1: Weight 2, Value 3
    # Item 2: Weight 3, Value 4
    # Item 3: Weight 4, Value 5
    
    psys = PSystem(skin)

    # Rule 1: Generation phase - Splits 'start' into evaluation tracker and 3 choice tokens
    psys.add_rule("cell", Rule(
        name="Generation_Phase",
        lhs={"start": 1},
        rhs={"evaluate": 1, "choice_1": 1, "choice_2": 1, "choice_3": 1},
        target="here"
    ))

    # Rules 2a & 2b: Item 1 choices (Include vs Skip)
    psys.add_rule("cell", Rule(name="Item1_Include", lhs={"choice_1": 1}, rhs={"include_1": 1}, target="here"))
    psys.add_rule("cell", Rule(name="Item1_Skip", lhs={"choice_1": 1}, rhs={"skip_1": 1}, target="here"))

    # Rules 3a & 3b: Item 2 choices (Include vs Skip)
    psys.add_rule("cell", Rule(name="Item2_Include", lhs={"choice_2": 1}, rhs={"include_2": 1}, target="here"))
    psys.add_rule("cell", Rule(name="Item2_Skip", lhs={"choice_2": 1}, rhs={"skip_2": 1}, target="here"))

    # Rules 4a & 4b: Item 3 choices (Include vs Skip)
    psys.add_rule("cell", Rule(name="Item3_Include", lhs={"choice_3": 1}, rhs={"include_3": 1}, target="here"))
    psys.add_rule("cell", Rule(name="Item3_Skip", lhs={"choice_3": 1}, rhs={"skip_3": 1}, target="here"))

    # Guard condition: Ensures all item choice tokens have been resolved to either include or skip
    def ready_to_evaluate(mem):
        item1_resolved = (mem.get_count("include_1") + mem.get_count("skip_1") == 1)
        item2_resolved = (mem.get_count("include_2") + mem.get_count("skip_2") == 1)
        item3_resolved = (mem.get_count("include_3") + mem.get_count("skip_3") == 1)
        has_eval = mem.get_count("evaluate") > 0
        return has_eval and item1_resolved and item2_resolved and item3_resolved

    # Rule 5: Evaluation & Communication - Sends a signal out to the skin membrane once choices are locked
    psys.add_rule("cell", Rule(
        name="Send_Solution_To_Skin",
        lhs={"evaluate": 1},
        rhs={"check_solution": 1},
        target="out",
        condition=ready_to_evaluate
    ))

    # Run the simulation
    psys.run(max_steps=5)

    # Final Inspections
    print("\n========================================")
    print("🏁 SIMULATION COMPLETED - FINAL STATES")
    print("========================================")
    print(skin)
    print(cell)

if __name__ == "__main__":
    solve_knapsack()