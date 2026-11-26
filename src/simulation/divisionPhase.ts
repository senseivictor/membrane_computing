import { Membrane } from '../model/Membrane';
import { bindCounterToken, createDaughterTokens } from './counterEnzyme';
import { cloneChildMembranes, getLivingMembranes, snapshotTree } from './membraneTree';

/** Randomly binds a division token, divides each active cell, then updates its counter enzyme. */
export function runDivisionPhase({ skin, nextId, random = Math.random }: any) {
  const history = [{ step: 0, title: 'Initial State', events: [], tree: snapshotTree(skin) }];
  let step = 0;
  let round = 0;

  while (true) {
    const activeCells = getLivingMembranes(skin).filter(cell =>
      cell.label === 'gen' && cell.objects.T_div_select &&
      cell.children.some(child => child.label.startsWith('object:') && child.objects.R_div_token && !child.objects.R_div_token.hidden)
    );
    if (!activeCells.length) break;
    round++;

    // Binding is a separate step: each division token chooses one available object receptor.
    const bindings = activeCells.map(cell => {
      const available = cell.children.filter(child =>
        child.label.startsWith('object:') && child.objects.R_div_token && !child.objects.R_div_token.hidden
      );
      const objectCell = available[Math.floor(random() * available.length)];
      delete cell.objects.T_div_select;
      objectCell.objects.R_div_token = { bound: true, hidden: true };
      objectCell.objects.T_div_select = 1;
      const [, number, ...nameParts] = objectCell.label.split(':');
      const name = nameParts.join(':');
      return { cell, objectCell, number: Number(number), name };
    });
    step++;
    history.push({
      step,
      title: `Division Token Binding - Round ${round}`,
      events: bindings.map(binding => ({
        event: 'T_div_select_bound',
        message: `T_div_select s-a lipit de C_${binding.number}`,
        object: binding.name
      })),
      tree: snapshotTree(skin)
    });

    // The chosen object is copied into the included daughter and omitted from the skipped daughter.
    const divisions = [];
    bindings.forEach(({ cell: parent, objectCell, number, name }) => {
      const baseTokens = { ...parent.objects };
      delete baseTokens.T_div_select;
      delete baseTokens.T_div_count;
      const selectedDaughter = new Membrane(
        nextId('gen'), 'gen', parent.parent, createDaughterTokens(baseTokens),
        { dna: [...(parent.dna || []), { item: number, name, choice: true, label: `IN ${name}` }] }
      );
      const skippedDaughter = new Membrane(
        nextId('gen'), 'gen', parent.parent, createDaughterTokens(baseTokens),
        { dna: [...(parent.dna || []), { item: number, name, choice: false, label: `OUT ${name}` }] }
      );
      cloneChildMembranes(parent, selectedDaughter, nextId, { objectLabel: objectCell.label, selected: true });
      cloneChildMembranes(parent, skippedDaughter, nextId, { objectLabel: objectCell.label, selected: false });

      const parentIndex = parent.parent.children.indexOf(parent);
      if (parentIndex !== -1) parent.parent.children.splice(parentIndex, 1, selectedDaughter, skippedDaughter);
      parent.alive = false;
      divisions.push({
        event: 'membrane_divided',
        parent_id: parent.id,
        object: name,
        object_cell_in: selectedDaughter.id,
        object_cell_out: skippedDaughter.id,
        counter_tokens_created: [selectedDaughter.id, skippedDaughter.id]
      });
    });
    step++;
    history.push({ step, title: `Division Round ${round}`, events: divisions, tree: snapshotTree(skin) });

    // Each daughter binds its newly created counter token to the enzyme.
    const counterEvents = [];
    getLivingMembranes(skin).filter(cell => cell.label === 'gen').forEach(cell => {
      const result = bindCounterToken(cell);
      if (result) counterEvents.push({
        event: result.full ? 'E_div_count_full' : 'T_div_count_bound',
        membrane_id: cell.id,
        T_div_count_bounds: result.total,
        T_div_count_capacity: result.capacity,
        T_eval: result.full
      });
    });
    step++;
    const evaluationReady = getLivingMembranes(skin)
      .filter(cell => cell.label === 'gen')
      .every(cell => cell.objects.T_eval === 1);
    history.push({
      step,
      title: evaluationReady ? 'Evaluation Signal' : `Counter Enzyme Round ${round}`,
      events: counterEvents,
      tree: snapshotTree(skin)
    });
    if (evaluationReady) break;
  }
  return history;
}
