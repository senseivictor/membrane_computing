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
    objects: { ...membrane.objects },
    children: (membrane.children || []).map(snapshotTree)
  };
}

/** Lists a membrane and all living descendants. */
export function getLivingMembranes(membrane: any): any[] {
  if (!membrane.alive) return [];
  return [membrane, ...(membrane.children || []).flatMap(getLivingMembranes)];
}
/** Copies a membrane's child cells into a daughter without changing their tokens. */
export function cloneChildMembranes(
  source: any,
  destination: any,
  nextId: (label: string) => string,
  decision: { objectLabel: string; stateToken: string }
) {
  (source.children || []).forEach(child => {
    const tokens: Record<string, number> = { ...child.objects };
    if (child.label === decision.objectLabel) {
      delete tokens.in_combination;
      delete tokens.not_in_combination;
      tokens[decision.stateToken] = 1;
    }
    const copy = new Membrane(nextId('object'), child.label, destination, tokens, {
      dna: [...(child.dna || [])], slotIdx: child.slotIdx, slotCount: child.slotCount
    });
    copy.alive = child.alive;
    destination.children.push(copy);
    cloneChildMembranes(child, copy, nextId, decision);
  });
}
