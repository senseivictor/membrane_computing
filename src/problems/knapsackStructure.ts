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
    new Membrane("gen#2", "gen", skin, {
      T_div_select: 1,
      E_div_count: { receptors: items.length, bounds: 0 },
    }),
  );
  items.forEach((item, index) => {
    initialMembrane.addChild(new Membrane(
      `object#${index + 1}`,
      `object:${index + 1}:${item.name}`,
      initialMembrane,
      { ...item.tokens, R_div_token: { bound: false, hidden: false } },
    ));
  });
  const divisionRules = [
    { name: "Bind_T_div_select_To_Random_Receptor", type: "binding" },
    { name: "Divide_Object_In_Or_Out", type: "division" },
    { name: "Recreate_T_div_select_And_E_div_count", type: "cell_creation" },
    { name: "Bind_T_div_count_To_E_div_count_Receptor", type: "binding" },
    { name: "Signal_Evaluation_When_E_div_count_Is_Full", type: "signal" },
  ];
  return {
    problem: "knapsack" as const,
    items,
    skin,
    initialMembrane,
    divisionRules,
  };
}
