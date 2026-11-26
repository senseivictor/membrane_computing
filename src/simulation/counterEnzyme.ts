/** Binds the external counter group and signals when all enzyme receptors are filled. */
export function bindCounterToken(cell: any) {
  const enzyme = cell.objects.E_div_count;
  const counterCount = Number(cell.objects.T_div_count) || 0;
  if (counterCount === 0 || !enzyme || enzyme.bounds >= enzyme.receptors) return null;

  delete cell.objects.T_div_count;
  enzyme.bounds += counterCount;
  const full = enzyme.bounds >= enzyme.receptors;
  if (full) {
    cell.objects.T_eval = 1;
    delete cell.objects.T_div_start;
  }
  return { bound: counterCount, total: enzyme.bounds, capacity: enzyme.receptors, full };
}
