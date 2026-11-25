import { getLivingMembranes, snapshotTree } from './membraneTree';
import { applyRule, ruleApplies } from './rules';

/** Runs enzyme binding, minimum checks, acceptance, and delta-driven dissolution. */
export function runConstraintPhase({
  skin, itemCount, constraintSpecs, bindingRulesByState, checkRulesByState,
  constraintSignalsRule, acceptRule, deltaObject, history
}: any) {
  let stepNumber = itemCount + 1;
  let bindingRound = 0;
  const evalMembranes = () => getLivingMembranes(skin).filter(membrane =>
    membrane.label === 'gen' && ruleApplies(membrane, { lhs: { eval: 1 } })
  );

  const objectDissolutionEvents = [];
  getLivingMembranes(skin).filter(membrane => membrane.label === 'gen').forEach(cell => {
    const objectCells = cell.children.filter(child => child.label.startsWith('object:'));
    objectCells.forEach(objectCell => {
      const included = (objectCell.objects.in_combination || 0) > 0;
      const discarded = { ...objectCell.objects };
      delete discarded.in_combination;
      delete discarded.not_in_combination;
      // Included objects release their property tokens; excluded objects dissolve without adding them.
      const released = included ? discarded : {};
      Object.entries(released).forEach(([token, count]: [string, any]) => {
        cell.objects[token] = (cell.objects[token] || 0) + count;
      });
      objectCell.alive = false;
      cell.children.splice(cell.children.indexOf(objectCell), 1);
      objectDissolutionEvents.push({
        event: 'object_membrane_dissolved',
        object: objectCell.label.slice('object:'.length),
        membrane_id: objectCell.id,
        included,
        objects_released: released,
        objects_discarded: included ? {} : discarded
      });
    });
  });
  history.push({
    step: stepNumber,
    title: 'Object Cell Dissolution',
    events: objectDissolutionEvents,
    tree: snapshotTree(skin)
  });

  while (true) {
    const events = [];
    evalMembranes().forEach(membrane => constraintSpecs.forEach(spec => {
      const state = spec.states.find(key => (membrane.objects[key] || 0) > 0);
      const rule = bindingRulesByState.get(state);
      if (rule) applyRule(membrane, rule, events);
    }));
    if (!events.length) break;
    bindingRound++;
    stepNumber++;
    history.push({ step: stepNumber, title: `Enzyme Binding - Round ${bindingRound}`, events, tree: snapshotTree(skin) });
  }

  const signalEvents = [];
  evalMembranes().forEach(membrane => applyRule(membrane, constraintSignalsRule, signalEvents));
  stepNumber++;
  history.push({ step: stepNumber, title: 'Constraint Signals', events: signalEvents, tree: snapshotTree(skin) });

  const checkEvents = [];
  getLivingMembranes(skin).filter(membrane => membrane.label === 'gen').forEach(membrane => {
    constraintSpecs.forEach(spec => {
      const markers = [spec.metKey, ...Array.from(
        { length: spec.min || 0 }, (_, index) => `need_${spec.property}_${index + 1}`
      )];
      const marker = markers.find(key => (membrane.objects[key] || 0) > 0);
      const rule = checkRulesByState.get(marker);
      if (rule) applyRule(membrane, rule, checkEvents);
    });
  });
  stepNumber++;
  history.push({ step: stepNumber, title: 'Constraint Rule Checks', events: checkEvents, tree: snapshotTree(skin) });

  const acceptanceEvents = [];
  getLivingMembranes(skin).filter(membrane => membrane.label === 'gen').forEach(membrane => {
    applyRule(membrane, acceptRule, acceptanceEvents);
  });
  stepNumber++;
  history.push({ step: stepNumber, title: 'Accept Valid Subsets', events: acceptanceEvents, tree: snapshotTree(skin) });

  const solutionRule = {
    name: 'Send_Solution_Out', type: 'evolution', lhs: { SAFE: 1 }, rhs: { solution: 1 },
    target: 'out', applies_to: 'gen'
  };
  const dissolutionEvents = [];
  const activeMembranes = getLivingMembranes(skin).filter(membrane => membrane.label === 'gen');
  activeMembranes.forEach(membrane => {
    if (membrane.objects[deltaObject]) {
      delete membrane.objects[deltaObject];
      membrane.alive = false;
      const releasedObjects = { ...membrane.objects };
      Object.entries(releasedObjects).forEach(([name, count]: [string, any]) => {
        skin.objects[name] = (skin.objects[name] || 0) + count;
      });
      if (membrane.parent) {
        const index = membrane.parent.children.indexOf(membrane);
        if (index !== -1) membrane.parent.children.splice(index, 1);
      }
      dissolutionEvents.push({
        event: 'membrane_dissolved', membrane_id: membrane.id, membrane_label: membrane.label,
        rule: 'Cell_Dissolution (delta)', objects_released: releasedObjects,
        description: 'The delta object dissolved this membrane; its remaining objects moved to the parent region.'
      });
    } else {
      applyRule(membrane, solutionRule, dissolutionEvents);
      const accepted = dissolutionEvents.some(event => event.membrane_id === membrane.id && event.rule === solutionRule.name);
      if (accepted) dissolutionEvents[dissolutionEvents.length - 1].description = 'Valid subset accepted; solution sent to the parent region.';
    }
  });
  stepNumber++;
  history.push({ step: stepNumber, title: 'Cell Dissolution', events: dissolutionEvents, tree: snapshotTree(skin) });
  return { stepNumber, solutionRule };
}
