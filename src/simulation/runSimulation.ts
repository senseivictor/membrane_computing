import { Membrane } from '../model/Membrane';
import { Object as CandidateObject } from '../model/Object';
import { runDivisionPhase } from './divisionPhase';
import { runConstraintPhase } from './constraintPhase';
import { createConstraintRules } from './rules';

/** Runs the simulation and returns each membrane-tree snapshot for display. */
export function runSimulationFromConfig(items, constraints, itemNames = [], modelProperties = null) {
  const objects = items.map((tokens, index) =>
    new CandidateObject(itemNames[index] || `Item ${index + 1}`, tokens)
  );
  let idCounter = 0;
  const nextId = (label: string) => `${label}#${++idCounter}`;
  const rules = createConstraintRules(constraints);

  const skin = new Membrane(nextId('skin'), 'skin');
  const firstCell = new Membrane(nextId('gen'), 'gen', skin, { d_1: 1, ...rules.initialObjects });
  objects.forEach(object => {
    firstCell.addChild(new Membrane(nextId('object'), `object:${object.name}`, firstCell, { ...object.tokens }));
  });
  skin.children.push(firstCell);

  const itemProperties = [...new Set(items.flatMap(item => Object.keys(item)))];
  const simulationProperties = modelProperties || itemProperties;
  const allProperties = [...new Set([
    ...simulationProperties,
    ...rules.constraintSpecs.map(spec => spec.property)
  ])].sort();
  const history = runDivisionPhase({
    skin,
    items: objects.map(object => ({ name: object.name, tokens: object.tokens })),
    itemNames,
    nextId
  });
  const constraintResult = runConstraintPhase({
    skin,
    itemCount: items.length,
    constraintSpecs: rules.constraintSpecs,
    bindingRulesByState: rules.bindingRulesByState,
    checkRulesByState: rules.checkRulesByState,
    constraintSignalsRule: rules.constraintSignalsRule,
    acceptRule: rules.acceptRule,
    deltaObject: rules.deltaObject,
    history
  });

  const solutionRule = constraintResult.solutionRule;
  const rulesMeta = createDivisionRules(objects);
  rulesMeta.push(...rules.bindingRules, rules.constraintSignalsRule);
  rulesMeta.push(...rules.checkRulesByState.values());
  rulesMeta.push(rules.acceptRule, solutionRule, {
    name: 'Cell_Dissolution (delta)', type: 'dissolution',
    lhs: { [rules.deltaObject]: 1 }, rhs: {}, target: 'here', applies_to: 'gen'
  });
  return {
    title: `Knapsack - ${items.length} items - ${formatConstraints(constraints)}`,
    rules: rulesMeta,
    steps: history,
    metadata: {
      items,
      itemNames,
      constraints,
      properties: allProperties
    }
  };
}

/** Describes each decision as a pair of object-cell instances. */
function createDivisionRules(objects) {
  return objects.map((object, index) => {
    const number = index + 1;
    const next = number === objects.length ? 'eval' : `d_${number + 1}`;
    return {
      name: `Divide_Item${number}`,
      type: 'division',
      trigger: `d_${number}`,
      daughter_a: { [next]: 1 },
      daughter_b: { [next]: 1 },
      object_cell_in: { name: object.name, tokens: { ...object.tokens, in_combination: 1 } },
      object_cell_out: { name: object.name, tokens: { ...object.tokens, not_in_combination: 1 } },
      applies_to: 'gen'
    };
  });
}

/** Formats active limits for the simulation title. */
function formatConstraints(constraints) {
  return Object.entries(constraints)
    .map(([property, condition]: [string, any]) => condition.max != null
      ? `${property}<=${condition.max}`
      : `${property}>=${condition.min}`)
    .join(', ');
}
