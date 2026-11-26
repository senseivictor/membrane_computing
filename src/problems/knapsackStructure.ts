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
      T_div_start: 1,
      E_div_count: { receptors: items.length + 1, bounds: 0 },
      T_div_count: 0,
    }),
  );
  items.forEach((item, index) => {
    initialMembrane.addChild(new Membrane(
      `object#${index + 1}`,
      `object:${index + 1}:${item.name}`,
      initialMembrane,
      { ...item.tokens, R_div_start: { bound: false, hidden: false } },
    ));
  });
  const divisionRules = [
    { name: "Bind_T_div_start_To_R_div_start_And_Increment_External_T_div_count", type: "binding" },
    { name: "Bind_All_T_div_count_To_E_div_count", type: "binding" },
    { name: "Signal_Evaluation_When_E_div_count_Is_Full", type: "signal" },
    { name: "Divide_Object_If_E_div_count_Is_Not_Full", type: "division" },
  ];
  return {
    problem: "knapsack" as const,
    items,
    skin,
    initialMembrane,
    divisionRules,
  };
}
