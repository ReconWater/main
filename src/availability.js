/** Single inventory availability calculation shared by public catalogue and admin.
 * Stock is never inferred from sealed-case equivalents for loose-vial sales.
 * Ten-vial packs require ten eligible loose vials from one manufacturer lot.
 * All availability calculations are informational; SQL RPCs remain authoritative.
 */
export function eligibleLot(lot, today = new Date().toISOString().slice(0,10)) {
  return lot?.status === 'available' && typeof lot.expiry_date === 'string' && lot.expiry_date > today;
}
export function availableStock(lots = [], today) {
  const eligible = lots.filter(lot => eligibleLot(lot, today));
  const free = (lot, kind) => Math.max(0, Number(lot?.[`${kind}_on_hand`] || 0) - Number(lot?.[`${kind}_reserved`] || 0));
  const loose = eligible.reduce((n, lot) => n + free(lot, 'loose'), 0);
  const sealed = eligible.reduce((n, lot) => n + free(lot, 'sealed'), 0);
  return {eligible, free, loose, sealed};
}
export function packageAvailability(packages = [], lots = [], today) {
  const {eligible, free, loose, sealed} = availableStock(lots, today);
  const byId = {};
  for (const pack of packages) {
    const count = Math.max(1, Number(pack.vials_per_pack) || 1);
    const amount = pack.stock_kind === 'sealed'
      ? Math.floor(sealed) // Each sealed case is one physical unit.
      : count === 1 ? Math.floor(loose)
      : eligible.reduce((n, lot) => n + Math.floor(free(lot, 'loose') / count), 0);
    byId[pack.id] = Math.max(0, amount);
  }
  return {loose, sealed, byId};
}

/** Earliest eligible lot that can supply a whole selected package. */
export function packageExpiry(pack, lots = [], today) {
  const {eligible, free} = availableStock(lots, today);
  const sealed = pack.stock_kind === 'sealed';
  const needed = sealed ? 1 : Math.max(1, Number(pack.vials_per_pack) || 1);
  return eligible.filter(lot => free(lot, sealed ? 'sealed' : 'loose') >= needed)
    .map(lot => lot.expiry_date).sort()[0] || null;
}
