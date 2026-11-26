import { Membrane } from '../model/Membrane';
import { Object as KnapsackObject } from '../model/Object';
import { runDivisionPhase } from './divisionPhase';
import { snapshotTree } from './membraneTree';

/** Builds the initial cell, puts every item cell inside it, and runs division to evaluation. */
export function runSimulationFromConfig(items, itemNames = [], random = Math.random) {
  const objects = items.map((tokens, index) =>
    new KnapsackObject(itemNames[index] || `Item ${index + 1}`, tokens)
  );
  let idCounter = 0;
  const nextId = (label: string) => `${label}#${++idCounter}`;
  const skin = new Membrane(nextId('skin'), 'skin');
  const firstCell = new Membrane(nextId('gen'), 'gen', skin, {
    T_div_select: 1,
    E_div_count: { receptors: objects.length, bounds: 0 },
    ...(objects.length === 0 ? { T_eval: 1 } : {})
  });

  objects.forEach((object, index) => {
    firstCell.addChild(new Membrane(
      nextId('object'),
      `object:${index + 1}:${object.name}`,
      firstCell,
      { ...object.tokens, R_div_token: { bound: false, hidden: false } }
    ));
  });
  skin.children.push(firstCell);

  const history = runDivisionPhase({ skin, nextId, random });
  const rules = [
    { name: 'Bind_T_div_select_To_Object_Receptor', type: 'binding' },
    { name: 'Divide_Object_Into_Included_And_Excluded_Cells', type: 'division' },
    { name: 'Recreate_T_div_select_And_E_div_count', type: 'cell_creation' },
    { name: 'Bind_T_div_count_To_E_div_count_Receptor', type: 'binding' },
    { name: 'Emit_T_eval_When_E_div_count_Is_Full', type: 'signal' }
  ];

  return {
    title: `Knapsack - ${objects.length} objects`,
    rules,
    steps: history,
    metadata: { items: objects.map(object => ({ name: object.name, tokens: object.tokens })) }
  };
}
