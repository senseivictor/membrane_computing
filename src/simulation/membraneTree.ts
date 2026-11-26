import { Membrane } from '../model/Membrane';

/** Copies a membrane tree into plain JSON data for a simulation step. */
export function snapshotTree(membrane: any): any {
  return {
    id: membrane.id,
    label: membrane.label,
    slotIdx: membrane.slotIdx ?? 0,
    slotCount: membrane.slotCount ?? 1,
    alive: membrane.alive !== false,
    dna: membrane.dna ? [...membrane.dna] : [],
    objects: Object.fromEntries(Object.entries(membrane.objects).map(([name, value]) => [
      name,
      value && typeof value === 'object' ? { ...value } : value
    ])),
    children: (membrane.children || []).map(snapshotTree)
  };
}

/** Lists a membrane and all living descendants. */
export function getLivingMembranes(membrane: any): any[] {
  if (!membrane.alive) return [];
  return [membrane, ...(membrane.children || []).flatMap(getLivingMembranes)];
}
/** Copies object cells, hiding the chosen receptor or omitting that object from one branch. */
export function cloneChildMembranes(
  source: any,
  destination: any,
  nextId: (label: string) => string,
  decision: { objectLabel: string; selected: boolean }
) {
  (source.children || []).forEach(child => {
    if (child.label === decision.objectLabel && !decision.selected) return;
    const tokens: Record<string, any> = Object.fromEntries(Object.entries(child.objects).map(([name, value]) => [
      name,
      value && typeof value === 'object' ? { ...value } : value
    ]));
    if (child.label === decision.objectLabel) {
      delete tokens.T_div_select;
      if (tokens.R_div_token) tokens.R_div_token = { bound: false, hidden: true };
    }
    const copy = new Membrane(nextId('object'), child.label, destination, tokens, {
      dna: [...(child.dna || [])], slotIdx: child.slotIdx, slotCount: child.slotCount
    });
    copy.alive = child.alive;
    destination.children.push(copy);
    cloneChildMembranes(child, copy, nextId, decision);
  });
}
