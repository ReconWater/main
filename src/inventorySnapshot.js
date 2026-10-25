import {packageAvailability} from './availability.js';

// Adapt the established dashboard ledger, also used by checkout and order RPCs.
// Never mix it with the unrelated recon_inventory_* / product_variants ledger.
export function inventorySnapshot(dashboard, today) {
  if (!dashboard) return null;
  const lots = dashboard.lots || [];
  const packages = dashboard.packages || [];
  const available = packageAvailability(packages, lots, today);
  const sum = key => lots.reduce((n, lot) => n + Number(lot[key] || 0), 0);
  return {
    installed: true, enabled: true, product: dashboard.products?.[0], lots, packages,
    packageAvailability: available.byId,
    summary: {
      loose_available: available.loose, sealed_available: available.sealed,
      loose_reserved: sum('loose_reserved'), sealed_reserved: sum('sealed_reserved'),
      total_vial_equivalent: sum('loose_on_hand') + 25 * sum('sealed_on_hand'),
    },
    movements: (dashboard.movements || []).map(row => ({
      ...row, movement_type: row.reason,
      loose_on_hand_delta: row.loose_delta,
      sealed_on_hand_delta: row.sealed_delta,
    })),
  };
}
