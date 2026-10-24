/** Inventory and cart math. Server-side SQL remains authoritative. */
export const MAX_REQUEST_VIALS = 500;
export function vialCount(lines = []) {
  return lines.reduce((n,line)=>n+Number(line.quantity||0)*Number(line.vials_per_pack||0),0);
}
export function formatAvailability(pack,lines=[],stock={}) {
  if (!pack) return {limit:0,remaining:0,inCart:0};
  const inCart=Number(lines.find(l=>l.package_id===pack.id)?.quantity||0);
  const others=lines.filter(l=>l.package_id!==pack.id);
  const usedLoose=others.filter(l=>l.stock_kind==='loose').reduce((n,l)=>n+Number(l.quantity)*Number(l.vials_per_pack),0);
  const pool=pack.stock_kind==='sealed'
    ? Number(stock.sealed||0)
    : Math.floor(Math.max(0,Number(stock.loose||0)-usedLoose)/Number(pack.vials_per_pack));
  const byVials=Math.floor(Math.max(0,MAX_REQUEST_VIALS-vialCount(others))/Number(pack.vials_per_pack));
  const sourceCap=Number.isFinite(Number(pack.available_packages)) && pack.available_packages != null ? Number(pack.available_packages) : Infinity;
  const limit=Math.max(0,Math.min(Number(pack.max_per_request||0),pool,sourceCap,byVials));
  return {limit,remaining:Math.max(0,limit-inCart),inCart};
}
export function isRequestable(pack,availability) {
  return Boolean(pack?.active && Number.isInteger(pack?.price_cents) && pack.price_cents>0 && availability?.remaining>0);
}
