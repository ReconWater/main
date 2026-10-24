/** CSV for records the authorized operator has already loaded. Escape formula-leading values. */
function cell(value){
 let s=String(value??'').replace(/\r?\n/g,' ');
 if(/^[\s]*[=+@-]/.test(s)) s="'"+s;
 return '"'+s.replace(/"/g,'""')+'"';
}
export function ordersCsv(orders=[]){
 const rows=[['Order number','Market','Created (UTC)','Status','Customer name','Customer email','SKU','Packaging','Packs','Vials per pack','Vials total','Product currency','Unit price','Line subtotal','Delivery currency','Delivery charge']];
 for(const o of orders){
  for(const i of o.order_items||[]){
   rows.push([o.order_number,o.market||'domestic',o.created_at,o.status,o.customer_name,o.customer_email,
    i.sku,i.package_label||'Legacy single vial',i.quantity,i.vials_per_pack||1,
    i.quantity*(i.vials_per_pack||1),o.subtotal_currency||'CAD',(i.unit_price_cents/100).toFixed(2),
    ((i.unit_price_cents*i.quantity)/100).toFixed(2),o.shipping_currency||'CAD',(Number(o.shipping_cents||0)/100).toFixed(2)]);
  }
 }
 return rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
