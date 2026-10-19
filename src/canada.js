// Shared customer-facing Canadian address helpers. Never trust browser-only validation.
export const CANADIAN_PROVINCES = Object.freeze([
  {code:'AB',name:'Alberta'},
  {code:'BC',name:'British Columbia'},
  {code:'MB',name:'Manitoba'},
  {code:'NB',name:'New Brunswick'},
  {code:'NL',name:'Newfoundland and Labrador'},
  {code:'NT',name:'Northwest Territories'},
  {code:'NS',name:'Nova Scotia'},
  {code:'NU',name:'Nunavut'},
  {code:'ON',name:'Ontario'},
  {code:'PE',name:'Prince Edward Island'},
  {code:'QC',name:'Quebec'},
  {code:'SK',name:'Saskatchewan'},
  {code:'YT',name:'Yukon'},
]);

export function formatCanadianPostal(value) {
  const compact = String(value || '').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
  return compact.length === 6 ? `${compact.slice(0,3)} ${compact.slice(3)}` : compact;
}
