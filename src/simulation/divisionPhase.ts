import { Membrane } from '../model/Membrane';
import { cloneChildMembranes, getLivingMembranes, snapshotTree } from './membraneTree';

/** Creates a yes/no daughter pair for each item, one division step at a time. */
export function runDivisionPhase({ skin, items, itemNames, nextId }: any) {
  const history = [{ step: 0, title: 'Initial State', events: [], tree: snapshotTree(skin) }];
  const itemCount = items.length;

  for (let index = 0; index < itemCount; index++) {
    const itemNumber = index + 1;
    const trigger = `d_${itemNumber}`;
    const next = itemNumber === itemCount ? 'eval' : `d_${itemNumber + 1}`;
    const item = items[index];
    const events = [];
    const eligibleMembranes = getLivingMembranes(skin).filter(membrane =>
      membrane.label === 'gen' && (membrane.objects[trigger] || 0) >= 1
    );
    const nextSlotCount = 2 ** itemNumber;

    eligibleMembranes.forEach(membrane => {
      const baseObjects = { ...membrane.objects };
      delete baseObjects[trigger];

      const selectedObjects = { ...baseObjects, [next]: (baseObjects[next] || 0) + 1 };
      const skippedObjects = { ...baseObjects, [next]: (baseObjects[next] || 0) + 1 };

      const itemName = itemNames[itemNumber - 1] || item.name || `Item ${itemNumber}`;
      const parentDna = membrane.dna || [];
      const selectedDna = parentDna.concat([{ item: itemNumber, name: itemName, choice: true, label: `IN ${itemName}` }]);
      const skippedDna = parentDna.concat([{ item: itemNumber, name: itemName, choice: false, label: `OUT ${itemName}` }]);
      const parentSlot = membrane.slotIdx ?? 0;
      const selectedDaughter = new Membrane(nextId('gen'), 'gen', membrane.parent, selectedObjects, {
        dna: selectedDna, slotIdx: parentSlot * 2, slotCount: nextSlotCount
      });
      const skippedDaughter = new Membrane(nextId('gen'), 'gen', membrane.parent, skippedObjects, {
        dna: skippedDna, slotIdx: parentSlot * 2 + 1, slotCount: nextSlotCount
      });
      // Each daughter gets fresh instances of every object cell; only the current object's marker differs.
      cloneChildMembranes(membrane, selectedDaughter, nextId, {
        objectLabel: `object:${itemName}`,
        stateToken: 'in_combination'
      });
      cloneChildMembranes(membrane, skippedDaughter, nextId, {
        objectLabel: `object:${itemName}`,
        stateToken: 'not_in_combination'
      });

      const parentIndex = membrane.parent.children.indexOf(membrane);
      if (parentIndex !== -1) membrane.parent.children.splice(parentIndex, 1, selectedDaughter, skippedDaughter);
      membrane.alive = false;
      events.push({
        event: 'membrane_divided',
        parent_id: membrane.id,
        parent_label: membrane.label,
        daughter_a_id: selectedDaughter.id,
        daughter_b_id: skippedDaughter.id,
        daughter_a_objects: { ...selectedObjects },
        daughter_b_objects: { ...skippedObjects },
        object_cells_created: [
          ...selectedDaughter.children.map(cell => ({
            name: cell.label.slice('object:'.length),
            branch: 'included',
            state: cell.objects.in_combination ? 'in_combination' : cell.objects.not_in_combination ? 'not_in_combination' : 'undecided'
          })),
          ...skippedDaughter.children.map(cell => ({
            name: cell.label.slice('object:'.length),
            branch: 'skipped',
            state: cell.objects.in_combination ? 'in_combination' : cell.objects.not_in_combination ? 'not_in_combination' : 'undecided'
          }))
        ]
      });
    });

    history.push({
      step: itemNumber,
      title: `Division (Item ${itemNumber})`,
      events,
      tree: snapshotTree(skin)
    });
  }
  return history;
}
