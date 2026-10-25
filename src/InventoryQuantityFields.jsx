import React,{useState} from 'react';
import './inventory-quantity.css';

export default function InventoryQuantityFields({adjust=false,lot,loose,sealed,onChange}){
 const [total,setTotal]=useState(''),[packing,setPacking]=useState('loose'),[message,setMessage]=useState('');
 const l=Number(loose),c=Number(sealed),valid=loose!==''&&sealed!==''&&Number.isInteger(l)&&Number.isInteger(c);
 const finalLoose=(adjust?Number(lot.loose_on_hand):0)+l;
 const finalCases=(adjust?Number(lot.sealed_on_hand):0)+c;
 const belowReserved=adjust&&(finalLoose<Number(lot.loose_reserved)||finalCases<Number(lot.sealed_reserved));
 const apply=()=>{
   const n=Number(total);
   if(total===''||!Number.isInteger(n)||(!adjust&&n<0)||Math.abs(n)>350000){setMessage('Enter a whole vial count within the supported range.');return;}
   const sign=n<0?-1:1,amount=Math.abs(n);
   const cases=packing==='sealed'?sign*Math.floor(amount/25):0;
   const singles=packing==='sealed'?sign*(amount%25):n;
   if(Math.abs(cases)>10000||Math.abs(singles)>100000){setMessage('Maximum: 10,000 cases or 100,000 loose vials per entry.');return;}
   onChange(singles,cases);setMessage('Calculation applied below. Review the physical packaging before saving.');
 };
 return <section className="inventory-quantity">
  <div className="inventory-quantity-title"><strong>{adjust?'Adjust stock quantities':'Receive cases and single vials'}</strong><span>1 sealed case = 25 vials</span></div>
  {adjust&&<p className="admin-form-note">Current: {lot.sealed_on_hand} sealed cases + {lot.loose_on_hand} single vials. Enter positive numbers to add stock or negative numbers to remove it.</p>}
  <div className="field-pair">
   <label className="form-field"><span>{adjust?'Sealed-case change (+ / −)':'Sealed cases received'}</span><input type="number" step="1" min={adjust?-10000:0} max="10000" required value={sealed} onChange={e=>onChange(loose,e.target.value)}/></label>
   <label className="form-field"><span>{adjust?'Single-vial change (+ / −)':'Single / loose vials received'}</span><input type="number" step="1" min={adjust?-100000:0} max="100000" required value={loose} onChange={e=>onChange(e.target.value,sealed)}/></label>
  </div>
  <div className="inventory-quantity-summary" aria-live="polite"><strong>{valid?`${c} cases × 25 + ${l} single vials = ${c*25+l} vials${adjust?' change':''}`:'Enter whole quantities'}</strong>{adjust&&valid&&<span>After adjustment: {finalCases} sealed cases + {finalLoose} single vials = {finalCases*25+finalLoose} total vials</span>}{belowReserved&&<span role="alert">This would reduce stock below its reserved quantity. Change the amounts before saving.</span>}</div>
  <details className="inventory-calculator"><summary>Calculate from a total vial count</summary>
   <label className="form-field"><span>{adjust?'Total vial change (+ / −)':'Total vials received'}</span><input type="number" step="1" min={adjust?-350000:0} max="350000" value={total} onChange={e=>setTotal(e.target.value)}/></label>
   <label className="form-field"><span>Physical packaging</span><select value={packing} onChange={e=>setPacking(e.target.value)}><option value="loose">All single / loose vials</option><option value="sealed">Full sealed cases + remaining single vials</option></select></label>
   <p className="admin-form-note">For example, 63 vials = 2 sealed cases + 13 singles, only if those two cases are still factory sealed. Opened cases count entirely as loose vials.</p>
   <button type="button" className="inventory-calculate-button" onClick={apply}>Calculate & use quantities</button>
   {message&&<p className="admin-form-note" role="status">{message}</p>}
  </details>
 </section>;
}
