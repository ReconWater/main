/** CSV for records the authorized operator has already loaded. Escape formula-leading values. */
function cell(value){
 let s=String(value??'').replace(/\r?\n/g,' ');
 if(/^[\s]*[=+@-]/.test(s)) s="'"+s;
 return '"'+s.replace(/"/g,'""')+'"';
}
export function ordersCsv(orders=[]){
 const rows=[['Order number','Market','Created (UTC)','Status','Customer name','Customer email','SKU','Packaging','Packs','Vials per pack','Vials total','Product currency','Unit price','Line subtotal','Promo code','Promo discount','Referral code','Referral reward code','Referral reward discount','Product total after discounts','Delivery currency','Delivery charge','Payment method','Payment status','Payment currency','Payment amount','Payment reference','USDC transaction hash','Paid at']];
 for(const o of orders){
  for(const i of o.order_items||[]){
   rows.push([o.order_number,o.market||'domestic',o.created_at,o.status,o.customer_name,o.customer_email,
    i.sku,i.package_label||'Legacy single vial',i.quantity,i.vials_per_pack||1,
    i.quantity*(i.vials_per_pack||1),o.subtotal_currency||'CAD',(i.unit_price_cents/100).toFixed(2),
    ((i.unit_price_cents*i.quantity)/100).toFixed(2),o.promo_code||'',(Number(o.promo_discount_cents||0)/100).toFixed(2),o.referral_code||'',o.referral_reward_code||'',(Number(o.referral_reward_discount_cents||0)/100).toFixed(2),((Math.max(0,Number(o.subtotal_cents||0)-Number(o.promo_discount_cents||0)-Number(o.referral_reward_discount_cents||0)))/100).toFixed(2),o.shipping_currency||'CAD',(Number(o.shipping_cents||0)/100).toFixed(2),o.payment_method||'',o.payment_status||'',o.payment_currency||'',o.payment_amount_cents==null?'':(Number(o.payment_amount_cents)/100).toFixed(2),o.payment_reference||'',o.payment_tx_hash||'',o.paid_at||'']);
  }
 }
 return rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
