// The Supabase service_submit_order RPC limits each product to 1..25 units per request.
export const MAX_REQUEST_UNITS = 25;
const nonnegativeInteger = (n) => Number.isFinite(Number(n)) ? Math.max(0, Math.trunc(Number(n))) : 0;
export function maxOrderable(stock, alreadyInCart=0) {
  return Math.max(0, Math.min(MAX_REQUEST_UNITS, nonnegativeInteger(stock)) - nonnegativeInteger(alreadyInCart));
}
export function nextCartQuantity(stock, current, requested=1) {
  const base = nonnegativeInteger(current);
  const change = Math.max(1, nonnegativeInteger(requested));
  return Math.min(MAX_REQUEST_UNITS, nonnegativeInteger(stock), base + change);
}
