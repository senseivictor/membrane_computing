import { Membrane } from '../model/Membrane';
import { bindCounterToken } from './counterEnzyme';
import { cloneChildMembranes, cloneTokens, getLivingMembranes, snapshotTree } from './membraneTree';

/** Binds the start signal, transfers count tokens into the enzyme, then evaluates or divides. */
export function runDivisionPhase({ skin, nextId, random = Math.random }: any) {
  const history = [{ step: 0, title: 'Initial State', events: [], tree: snapshotTree(skin) }];
  let step = 0;
  let round = 0;

  while (true) {
    const activeCells = getLivingMembranes(skin).filter(cell =>
      cell.label === 'gen' && cell.objects.T_div_start &&
      cell.children.some(child => child.label.startsWith('object:') && child.objects.R_div_start && !child.objects.R_div_start.hidden)
    );
    if (!activeCells.length) break;
    round++;

    // Bind the division-start token and add one more count to the external token group.
    const bindings = activeCells.map(cell => {
      const available = cell.children.filter(child =>
        child.label.startsWith('object:') && child.objects.R_div_start && !child.objects.R_div_start.hidden
      );
      const objectCell = available[Math.floor(random() * available.length)];
      delete cell.objects.T_div_start;
      const previousCount = Number(cell.objects.T_div_count) || 0;
      cell.objects.T_div_count = previousCount + 1;
      objectCell.objects.R_div_start = { bound: true, hidden: true };
      objectCell.objects.T_div_start = 1;
      const [, number, ...nameParts] = objectCell.label.split(':');
      const name = nameParts.join(':');
      return { cell, objectCell, number: Number(number), name, previousCount };
    });
    step++;
    history.push({
      step,
      title: `Division Token Binding - Round ${round}`,
      events: bindings.map(binding => ({
        event: 'T_div_start_bound',
        message: `T_div_start s-a lipit de C_${binding.number}`,
        object: binding.name,
        membrane_id: binding.cell.id,
        counter_previous_bounds: binding.previousCount,
        T_div_count_created: 1
      })),
      tree: snapshotTree(skin)
    });

    // Move each complete external counter group into its enzyme before deciding whether to divide.
    const counterEvents = bindings.flatMap(({ cell }) => {
      const result = bindCounterToken(cell);
      return result ? [{
        event: result.full ? 'E_div_count_full' : 'T_div_count_bound',
        message: `T_div_count s-a unit cu E_div_count in ${cell.id}`,
        membrane_id: cell.id,
        T_div_count_bounds: result.total,
        T_div_count_capacity: result.capacity,
        T_eval: result.full
      }] : [];
    });
    step++;
    history.push({
      step,
      title: `Counter Enzyme Binding - Round ${round}`,
      events: counterEvents,
      tree: snapshotTree(skin)
    });

    const evaluationReady = getLivingMembranes(skin)
      .filter(cell => cell.label === 'gen')
      .every(cell => cell.objects.T_eval === 1);
    if (evaluationReady) {
      step++;
      history.push({
        step,
        title: 'Evaluation Signal',
        events: getLivingMembranes(skin)
          .filter(cell => cell.label === 'gen' && cell.objects.T_eval === 1)
          .map(cell => ({ event: 'T_eval', message: `T_eval a fost emis in ${cell.id}` })),
        tree: snapshotTree(skin)
      });
      break;
    }

    // Separate the enzyme's count back into free tokens while cloning it empty.
    const divisions = [];
    bindings.forEach(({ cell: parent, objectCell, number, name }) => {
      const daughterTokens = () => {
        const tokens = cloneTokens(parent.objects);
        tokens.T_div_start = 1;
        tokens.T_div_count = parent.objects.E_div_count.bounds;
        tokens.E_div_count.bounds = 0;
        return tokens;
      };
      const selectedDaughter = new Membrane(
        nextId('gen'), 'gen', parent.parent, daughterTokens(),
        { dna: [...(parent.dna || []), { item: number, name, choice: true, label: `IN ${name}` }] }
      );
      const skippedDaughter = new Membrane(
        nextId('gen'), 'gen', parent.parent, daughterTokens(),
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
      });
    });
    step++;
    history.push({ step, title: `Division Round ${round}`, events: divisions, tree: snapshotTree(skin) });
  }
  return history;
}
