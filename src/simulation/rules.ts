/** Builds the multiset rules used to check each configured constraint. */
export function createConstraintRules(constraints: Record<string, any>) {
  const deltaObject = 'δ';
  const enzymeKey = (property: string, count: number) => `enzyme_${property}_${count}`;
  const constraintSpecs = Object.entries(constraints)
    .filter(([, condition]) => condition.min != null || condition.max != null)
    .map(([property, condition]: [string, any]) => {
      const min = condition.min == null ? null : Math.ceil(Number(condition.min));
      const max = condition.max == null ? null : Math.floor(Number(condition.max));
      const capacity = max != null ? Math.max(1, max + 1) : Math.max(0, min || 0);
      return {
        property, min, max, capacity,
        metKey: `met_${property}`,
        states: Array.from({ length: capacity + 1 }, (_, count) => enzymeKey(property, count))
      };
    });

  const bindingRules = [];
  const bindingRulesByState = new Map();
  constraintSpecs.forEach(spec => {
    for (let count = 0; count < spec.capacity; count++) {
      const finalBinding = spec.max != null && count + 1 === spec.capacity;
      const nextKey = enzymeKey(spec.property, count + 1);
      const remainingMinimum = spec.min == null ? 0 : Math.max(0, spec.min - count);
      const minimumKey = remainingMinimum > 0 ? `need_${spec.property}_${remainingMinimum}` : spec.metKey;
      const nextMinimumKey = remainingMinimum > 1 ? `need_${spec.property}_${remainingMinimum - 1}` : spec.metKey;
      const rhs = { [nextKey]: 1 };
      if (!finalBinding) rhs[nextMinimumKey] = 1;
      if (finalBinding) rhs[deltaObject] = 1;
      const rule = {
        name: `Enzyme_Binding_${spec.property}_${count}`,
        type: 'evolution',
        lhs: { [enzymeKey(spec.property, count)]: 1, [spec.property]: 1, [minimumKey]: 1 },
        rhs,
        target: 'here',
        applies_to: 'gen',
        description: finalBinding
          ? `${spec.property} enzyme reached capacity ${spec.capacity} and emitted ${deltaObject}.`
          : `${spec.property} token bound to its enzyme.`
      };
      bindingRules.push(rule);
      bindingRulesByState.set(enzymeKey(spec.property, count), rule);
    }
  });

  const checkRulesByState = new Map();
  constraintSpecs.forEach(spec => {
    checkRulesByState.set(spec.metKey, {
      name: `Check_${spec.property}_Minimum_Met`, type: 'evolution',
      lhs: { [spec.metKey]: 1, [`check_${spec.property}`]: 1 },
      rhs: { [spec.metKey]: 1, [`valid_${spec.property}`]: 1 }, target: 'here', applies_to: 'gen'
    });
    for (let remaining = 1; remaining <= (spec.min || 0); remaining++) {
      const needKey = `need_${spec.property}_${remaining}`;
      checkRulesByState.set(needKey, {
        name: `Check_${spec.property}_Minimum_Missing_${remaining}`, type: 'evolution',
        lhs: { [needKey]: 1, [`check_${spec.property}`]: 1 },
        rhs: { [needKey]: 1, [deltaObject]: 1 }, target: 'here', applies_to: 'gen'
      });
    }
  });

  const constraintSignalsRule = {
    name: 'Start_Constraint_Checks', type: 'evolution', lhs: { eval: 1 },
    rhs: Object.fromEntries([
      ...constraintSpecs.map(spec => [`check_${spec.property}`, 1]),
      ...(constraintSpecs.length ? [['final_check', 1]] : [['SAFE', 1]])
    ]), target: 'here', applies_to: 'gen'
  };
  const acceptRule = {
    name: 'Accept_Valid_Subset', type: 'evolution',
    lhs: Object.fromEntries([['final_check', 1], ...constraintSpecs.map(spec => [`valid_${spec.property}`, 1])]),
    rhs: { SAFE: 1 }, target: 'here', applies_to: 'gen'
  };
  const initialObjects = {};
  constraintSpecs.forEach(spec => {
    initialObjects[enzymeKey(spec.property, 0)] = 1;
    const minimumKey = spec.min > 0 ? `need_${spec.property}_${spec.min}` : spec.metKey;
    initialObjects[minimumKey] = 1;
  });

  return { deltaObject, constraintSpecs, bindingRules, bindingRulesByState, checkRulesByState,
    constraintSignalsRule, acceptRule, initialObjects };
}

/** Returns whether a membrane has enough objects to consume a rule's left side. */
export function ruleApplies(membrane: any, rule: any) {
  return Object.entries(rule.lhs).every(([object, count]: [string, any]) => (membrane.objects[object] || 0) >= count);
}

/** Consumes a rule's input objects, produces its output objects, and records the event. */
export function applyRule(membrane: any, rule: any, events: any[]) {
  if (!ruleApplies(membrane, rule)) return false;
  Object.entries(rule.lhs).forEach(([object, count]: [string, any]) => {
    membrane.objects[object] -= count;
    if (membrane.objects[object] === 0) delete membrane.objects[object];
  });
  const destination = rule.target === 'out' && membrane.parent ? membrane.parent : membrane;
  Object.entries(rule.rhs).forEach(([object, count]: [string, any]) => {
    destination.objects[object] = (destination.objects[object] || 0) + count;
  });
  events.push({
    event: 'rule_fired', rule: rule.name, membrane_id: membrane.id, membrane_label: membrane.label,
    consumed: rule.lhs, produced: rule.rhs, target: rule.target, description: rule.description
  });
  return true;
}
