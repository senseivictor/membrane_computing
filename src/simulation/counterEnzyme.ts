/** Creates a daughter membrane's generic division token and counter enzyme. */
export function createDaughterTokens(parentTokens: Record<string, any>) {
  const parentEnzyme = parentTokens.E_div_count;
  return {
    ...parentTokens,
    T_div_select: 1,
    E_div_count: {
      receptors: parentEnzyme.receptors,
      bounds: parentEnzyme.bounds || 0
    },
    T_div_count: 1
  };
}

/** Binds one counter token to the enzyme and signals when all receptors are filled. */
export function bindCounterToken(cell: any) {
  const enzyme = cell.objects.E_div_count;
  if (!cell.objects.T_div_count || !enzyme || enzyme.bounds >= enzyme.receptors) return null;

  delete cell.objects.T_div_count;
  enzyme.bounds++;
  const full = enzyme.bounds >= enzyme.receptors;
  if (full) {
    cell.objects.T_eval = 1;
    delete cell.objects.T_div_select;
  }
  return { bound: 1, total: enzyme.bounds, capacity: enzyme.receptors, full };
}
