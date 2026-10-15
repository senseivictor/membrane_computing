from membrane import Membrane
from rule import Rule
from psystem import PSystem

def solve_knapsack():
    # 1. Setup Membrane Structure
    skin = Membrane("skin")
    cell = Membrane("cell", parent=skin)
    skin.children.append(cell)

    # Initial objects in the cell
    cell.add_object("start", 1)

    psys = PSystem(skin)

    # Rule 1: Generation phase
    psys.add_rule("cell", Rule(
        lhs={"start": 1},
        rhs={"evaluate": 1, "choice_1": 1, "choice_2": 1, "choice_3": 1},
        target="here"
    ))

    # Rules 2a & 2b: Item 1 choices
    psys.add_rule("cell", Rule(lhs={"choice_1": 1}, rhs={"include_1": 1}, target="here"))
    psys.add_rule("cell", Rule(lhs={"choice_1": 1}, rhs={"skip_1": 1}, target="here"))

    # Rules 3a & 3b: Item 2 choices
    psys.add_rule("cell", Rule(lhs={"choice_2": 1}, rhs={"include_2": 2}, target="here"))
    psys.add_rule("cell", Rule(lhs={"choice_2": 1}, rhs={"skip_2": 1}, target="here"))

    # Rules 4a & 4b: Item 3 choices
    psys.add_rule("cell", Rule(lhs={"choice_3": 1}, rhs={"include_3": 3}, target="here"))
    psys.add_rule("cell", Rule(lhs={"choice_3": 1}, rhs={"skip_3": 1}, target="here"))

    # Guard condition for evaluation
    def ready_to_evaluate(mem):
        return mem.get_count("evaluate") > 0 and \
               (mem.get_count("include_1") + mem.get_count("skip_1") == 1) and \
               (mem.get_count("include_2") + mem.get_count("skip_2") == 1) and \
               (mem.get_count("include_3") + mem.get_count("skip_3") == 1)

    # Rule 5: Aggregate to skin membrane when ready
    psys.add_rule("cell", Rule(
        lhs={"evaluate": 1},
        rhs={"check_solution": 1},
        target="out",
        condition=ready_to_evaluate
    ))

    # Run the P system simulation
    print("Running P System simulation for Knapsack Problem...")
    psys.run(max_steps=10)

    # Inspect results
    print("\nFinal State in Skin Membrane:")
    print(skin)
    print("Final State in Cell Membrane:")
    print(cell)

if __name__ == "__main__":
    solve_knapsack()