import { Membrane } from "../model/Membrane";
import { Object } from "../model/Object";

/** A small, hand-written knapsack example with explicit division rules. */
export function createKnapsackExample() {
  const items = [
    new Object("Tent", { weight: 2, value: 3 }),
    new Object("Stove", { weight: 3, value: 4 }),
    new Object("Rope", { weight: 1, value: 2 }),
  ];
  const skin = new Membrane("skin#1", "skin");
  const initialMembrane = skin.addChild(
    new Membrane("gen#2", "gen", skin, { d_1: 1 }),
  );
  const divisionRules = [
    {
      name: "Divide_Tent",
      type: "division",
      trigger: "d_1",
      daughter_a: { d_2: 1 },
      daughter_b: { d_2: 1 },
      object_cell_in: { name: "Tent", tokens: { weight: 2, value: 3, in_combination: 1 } },
      object_cell_out: { name: "Tent", tokens: { weight: 2, value: 3, not_in_combination: 1 } },
    },
    {
      name: "Divide_Stove",
      type: "division",
      trigger: "d_2",
      daughter_a: { d_3: 1 },
      daughter_b: { d_3: 1 },
      object_cell_in: { name: "Stove", tokens: { weight: 3, value: 4, in_combination: 1 } },
      object_cell_out: { name: "Stove", tokens: { weight: 3, value: 4, not_in_combination: 1 } },
    },
    {
      name: "Divide_Rope",
      type: "division",
      trigger: "d_3",
      daughter_a: { eval: 1 },
      daughter_b: { eval: 1 },
      object_cell_in: { name: "Rope", tokens: { weight: 1, value: 2, in_combination: 1 } },
      object_cell_out: { name: "Rope", tokens: { weight: 1, value: 2, not_in_combination: 1 } },
    },
  ];
  return {
    problem: "knapsack" as const,
    items,
    constraints: { weight: { max: 5 } },
    skin,
    initialMembrane,
    divisionRules,
  };
}
