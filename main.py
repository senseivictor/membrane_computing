"""
main.py — Generic P-System knapsack solver with multi-property items.

▸ CONFIGURE HERE — add any number of items and any number of properties.
  Properties are encoded as UNARY TOKENS inside membranes:
    item with weight=3  →  3 copies of the 'weight' object in the membrane
    item with cost=5    →  5 copies of the 'cost'   object in the membrane

  Constraints check the total token counts at evaluation time.
  Add/remove properties freely — the builder handles everything automatically.
"""

from api import PSystemAPI


# ══════════════════════════════════════════════════════════════════════════
#  CONFIGURATION  — edit freely
# ══════════════════════════════════════════════════════════════════════════

ITEMS = [
    {"weight": 2, "cost": 3},   # Item 1
    {"weight": 3, "cost": 4},   # Item 2
    {"weight": 4, "cost": 5},   # Item 3
]

CONSTRAINTS = {
    "weight": {"max": 5},        # total weight of chosen items ≤ 5
    # "cost":   {"min": 4},      # uncomment to also require total cost ≥ 4
    # "volume": {"max": 10},     # add more properties & constraints freely
}

# ══════════════════════════════════════════════════════════════════════════
#  BUILDER  — no need to edit below
# ══════════════════════════════════════════════════════════════════════════

def build_knapsack(items, constraints):
    """
    Automatically construct a P-System for the knapsack problem.

    For N items this produces:
      • N division rules, one per item.
        - 'yes' daughter: choice marker yes_i + all property tokens (unary)
        - 'no'  daughter: choice marker no_i  (no property tokens added)
      • 2 evaluation rules: Accept_Valid / Discard_Invalid
        Guard functions count property tokens and check constraints.
    """
    n   = len(items)
    all_props = sorted({k for item in items for k in item})

    api = PSystemAPI(
        f"Knapsack · {n} items · "
        + ", ".join(f"{p}≤{c['max']}" if 'max' in c else f"{p}≥{c['min']}"
                    for p, c in constraints.items())
    )

    skin = api.skin()
    api.child(skin, "gen", objects={"d_1": 1})

    # ── Division rules ─────────────────────────────────────────────────────
    for idx, item in enumerate(items):
        num     = idx + 1
        trigger = f"d_{num}"
        nxt     = "eval" if num == n else f"d_{num+1}"

        # 'yes' daughter: include this item → place its property tokens (unary)
        yes_objs = {f"yes_{num}": 1, nxt: 1}
        for prop, val in item.items():
            yes_objs[prop] = yes_objs.get(prop, 0) + int(val)

        # 'no' daughter: skip this item → no property tokens
        no_objs = {f"no_{num}": 1, nxt: 1}

        api.division_rule("gen",
                          trigger=trigger,
                          daughter_a=yes_objs,
                          daughter_b=no_objs,
                          name=f"Divide_Item{num}")

    # ── Evaluation guards ──────────────────────────────────────────────────
    def make_guards(constraints):
        def _check(mem):
            for prop, conds in constraints.items():
                count = mem.get_count(prop)
                if "max" in conds and count > conds["max"]:
                    return False
                if "min" in conds and count < conds["min"]:
                    return False
            return True

        def valid_and_ready(mem):
            return mem.get_count("eval") > 0 and _check(mem)

        def invalid(mem):
            return mem.get_count("eval") > 0 and not _check(mem)

        return valid_and_ready, invalid

    valid_guard, invalid_guard = make_guards(constraints)

    api.evolution_rule("gen", name="Accept_Valid_Subset",
                       lhs={"eval": 1}, rhs={"solution": 1},
                       target="out", condition=valid_guard)

    api.evolution_rule("gen", name="Discard_Invalid_Subset",
                       lhs={"eval": 1}, rhs={},
                       target="here", condition=invalid_guard)

    return api, all_props


# ══════════════════════════════════════════════════════════════════════════
#  RUN
# ══════════════════════════════════════════════════════════════════════════

api, all_props = build_knapsack(ITEMS, CONSTRAINTS)

api.run(max_steps=len(ITEMS) + 3)

# Export — include item/constraint metadata for the visualizer
api.export("simulation_data.json", metadata={
    "items":       ITEMS,
    "constraints": CONSTRAINTS,
    "properties":  all_props,   # list of property names (e.g. ['cost','weight'])
})

print(f"\nValid subsets found: {api.result_count}")
print("Open visualizer.html in a browser to watch the simulation.")
