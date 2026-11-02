import { createClient } from '@supabase/supabase-js';
import {packageAvailability} from '../../src/availability.js';
import {chitChatsConfigured,chitChatsEnvironment} from './_chitchats.mjs';

const reply = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

const normalizePromoCode = value => String(value || '').trim().toUpperCase();
const todayIso = () => new Date().toISOString().slice(0,10);
const isEthAddress = value => /^0x[a-fA-F0-9]{40}$/.test(String(value||'').trim());
const isEthTxHash = value => /^0x[a-fA-F0-9]{64}$/.test(String(value||'').trim());
const promoDiscount = (promo, subtotal) => {
  const base=Math.max(0,Number(subtotal||0));
  if(promo.discount_type==='percentage') return Math.min(base,Math.floor(base*Number(promo.discount_value)/100));
  return Math.min(base,Number(promo.discount_value||0));
};
async function validatePromo(db,rawCode,subtotal){
  const code=normalizePromoCode(rawCode);
  if(!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)) throw new Error('Promo code is invalid or unavailable');
  const {data:promo,error}=await db.from('promo_codes').select('*').eq('code',code).eq('active',true).maybeSingle();
  if(error) throw error;
  const today=todayIso();
  if(!promo || (promo.starts_on&&promo.starts_on>today) || (promo.ends_on&&promo.ends_on<today) ||
     (promo.max_uses!=null&&Number(promo.uses_count||0)>=Number(promo.max_uses)) || Number(subtotal||0)<Number(promo.min_subtotal_cents||0)) {
    throw new Error('Promo code is invalid or unavailable');
  }
  const discount=promoDiscount(promo,subtotal);
  if(discount<=0) throw new Error('Promo code is invalid or unavailable');
  return {promo,discount,final:Math.max(0,Number(subtotal)-discount)};
}
async function secureDomesticSubtotal(db,items){
  if(!Array.isArray(items)||items.length<1||items.length>4) throw new Error('Invalid package selection');
  const ids=[...new Set(items.map(i=>String(i?.package_id||'')).filter(Boolean))];
  if(ids.length!==items.length) throw new Error('Invalid package selection');
  const {data:packages,error}=await db.from('product_packages').select('id,price_cents,active,max_per_request').in('id',ids);
  if(error) throw error;
  const byId=new Map((packages||[]).map(p=>[p.id,p]));
  let subtotal=0;
  for(const item of items){
    const pack=byId.get(String(item.package_id));
    const qty=Number(item.quantity);
    if(!pack||!pack.active||pack.price_cents==null||!Number.isInteger(qty)||qty<1||qty>Number(pack.max_per_request||100)) throw new Error('Invalid package selection');
    subtotal+=qty*Number(pack.price_cents);
  }
  return subtotal;
}
async function loadPaymentSettings(db){
  const {data,error}=await db.from('payment_settings').select('*').eq('id',1).maybeSingle();
  if(error) throw error;
  return data||{id:1,etransfer_enabled:false,etransfer_email:'',etransfer_recipient_name:'',etransfer_note:'',usdc_eth_enabled:false,usdc_eth_address:'',usdc_note:''};
}
function paymentInstructions(order,settings){
  const common={
    order_id:order.id,
    order_number:order.order_number,
    method:order.payment_method,
    status:order.payment_status,
    amount_cents:Number(order.payment_amount_cents||0),
    currency:order.payment_currency||((order.market==='international')?'USD':'CAD'),
    reference:order.payment_reference||order.order_number,
  };
  if(order.payment_method==='etransfer'){
    if(!settings.etransfer_enabled||!settings.etransfer_email) throw new Error('Interac e-Transfer is not configured');
    return {...common,recipient_name:settings.etransfer_recipient_name||'Recon Water',destination:settings.etransfer_email,note:settings.etransfer_note||'Use the order reference in the transfer message.'};
  }
  if(order.payment_method==='usdc_eth'){
    if(!settings.usdc_eth_enabled||!isEthAddress(settings.usdc_eth_address)) throw new Error('USDC on Ethereum is not configured');
    return {...common,destination:settings.usdc_eth_address,network:'Ethereum',asset:'USDC',note:settings.usdc_note||'Send USDC only on Ethereum mainnet (ERC-20). Do not use another network.'};
  }
  throw new Error('Payment method is not configured');
}

const escapeHtml = value => String(value ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const moneyText = (cents,currency='CAD') => new Intl.NumberFormat('en-CA',{style:'currency',currency}).format(Number(cents||0)/100);
const resendConfig = () => {
  const apiKey=String(process.env.RESEND_API_KEY||'').trim();
  const fromEmail=String(process.env.RESEND_FROM_EMAIL||'').trim();
  const fromName=String(process.env.RESEND_FROM_NAME||'Recon Water').trim()||'Recon Water';
  return {apiKey,fromEmail,fromName,configured:Boolean(apiKey&&fromEmail)};
};
async function sendResendEmail({to,subject,html,text,idempotencyKey}){
  const cfg=resendConfig();
  if(!cfg.configured) throw new Error('Transactional email is not configured in Netlify');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to||'').trim())) throw new Error('Customer email address is invalid');
  const from=cfg.fromEmail.includes('<')?cfg.fromEmail:`${cfg.fromName} <${cfg.fromEmail}>`;
  const headers={'Authorization':`Bearer ${cfg.apiKey}`,'Content-Type':'application/json'};
  if(idempotencyKey) headers['Idempotency-Key']=String(idempotencyKey).slice(0,256);
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',headers,
    body:JSON.stringify({from,to:[String(to).trim()],subject,html,text})
  });
  let payload={};
  try{payload=await response.json()}catch{}
  if(!response.ok) {
    console.error('Resend email failed',response.status,payload?.name||'',payload?.message||'');
    throw new Error('Transactional email could not be sent');
  }
  return payload;
}
function paymentRequestEmail(order,instructions){
  const amount=moneyText(instructions.amount_cents,instructions.currency);
  const orderNumber=escapeHtml(order.order_number||'');
  const customer=escapeHtml(order.customer_name||'');
  const destination=escapeHtml(instructions.destination||'');
  const recipient=escapeHtml(instructions.recipient_name||'Recon Water');
  const reference=escapeHtml(instructions.reference||order.order_number||'');
  const note=escapeHtml(instructions.note||'Use the order reference in the transfer message.');
  const subject=`Payment requested · ${order.order_number} · Recon Water`;
  const text=`Recon Water\n\nYour order ${order.order_number} has been approved and reserved.\n\nAmount due: ${amount}\nSend Interac e-Transfer to: ${instructions.destination}\nRecipient: ${instructions.recipient_name||'Recon Water'}\nReference: ${instructions.reference||order.order_number}\n\n${instructions.note||'Use the order reference in the transfer message.'}\n\nDo not send a different amount. Your order will move to fulfillment after the transfer is verified.`;
  const html=`<!doctype html><html><body style="margin:0;background:#f3f7f8;font-family:Arial,sans-serif;color:#123746"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f7f8;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #d7e3e7;border-radius:16px;overflow:hidden"><tr><td style="padding:28px 32px 18px"><div style="font-size:12px;letter-spacing:2px;font-weight:700;color:#5e8492">RECON WATER</div><h1 style="margin:8px 0 10px;font-size:26px;line-height:1.2;color:#0d3444">Payment requested.</h1><p style="margin:0;color:#55717c;line-height:1.6">${customer?`${customer}, your`: 'Your'} order <strong>${orderNumber}</strong> has been approved and reserved.</p></td></tr><tr><td style="padding:0 32px 24px"><div style="background:#eef5f6;border-radius:12px;padding:20px"><div style="font-size:12px;letter-spacing:1.4px;color:#6b8791;font-weight:700">AMOUNT DUE</div><div style="font-size:34px;font-weight:800;margin-top:5px;color:#0d3444">${escapeHtml(amount)}</div></div></td></tr><tr><td style="padding:0 32px 30px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:15px"><tr><td style="padding:10px 0;color:#6b8791">Interac e-Transfer</td><td style="padding:10px 0;text-align:right;font-weight:700">${destination}</td></tr><tr><td style="padding:10px 0;color:#6b8791">Recipient</td><td style="padding:10px 0;text-align:right;font-weight:700">${recipient}</td></tr><tr><td style="padding:10px 0;color:#6b8791">Reference</td><td style="padding:10px 0;text-align:right;font-weight:700">${reference}</td></tr></table><div style="margin-top:18px;padding:15px 16px;border-left:3px solid #7ba1ae;background:#f7fafb;color:#4d6974;line-height:1.55">${note}</div><p style="margin:20px 0 0;color:#55717c;line-height:1.6">Please send the exact amount shown above. We will move the order to fulfillment after the transfer is independently verified.</p></td></tr></table></td></tr></table></body></html>`;
  return {subject,text,html};
}
function paymentReceivedEmail(order){
  const amount=moneyText(order.payment_amount_cents,order.payment_currency||'CAD');
  const orderNumber=escapeHtml(order.order_number||'');
  const customer=escapeHtml(order.customer_name||'');
  const subject=`Payment received · ${order.order_number} · Recon Water`;
  const text=`Recon Water\n\nPayment received for order ${order.order_number}.\nAmount confirmed: ${amount}\n\nYour payment has been verified and the order is ready to proceed to fulfillment.`;
  const html=`<!doctype html><html><body style="margin:0;background:#f3f7f8;font-family:Arial,sans-serif;color:#123746"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f7f8;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #d7e3e7;border-radius:16px"><tr><td style="padding:30px 32px"><div style="font-size:12px;letter-spacing:2px;font-weight:700;color:#5e8492">RECON WATER</div><h1 style="margin:8px 0 10px;font-size:26px;color:#0d3444">Payment received.</h1><p style="margin:0;color:#55717c;line-height:1.6">${customer?`${customer}, we have`: 'We have'} verified payment for order <strong>${orderNumber}</strong>.</p><div style="margin:24px 0;background:#eef5f6;border-radius:12px;padding:20px"><div style="font-size:12px;letter-spacing:1.4px;color:#6b8791;font-weight:700">PAYMENT CONFIRMED</div><div style="font-size:32px;font-weight:800;margin-top:5px;color:#0d3444">${escapeHtml(amount)}</div></div><p style="margin:0;color:#55717c;line-height:1.6">The order can now proceed to fulfillment. No further payment action is required.</p></td></tr></table></td></tr></table></body></html>`;
  return {subject,text,html};
}

const safeError = e => {
  const m=String(e?.message||'Request failed');
  if (/^(Invalid|Insufficient|Too many|Package|Product|Promo|Order not|Legacy|No eligible|Cannot adjust|Expired|Allocated lot|Duplicate|Request exceeds|Select up|Request total|Payment|Interac|USDC|International|Referral|Transactional|Customer email)/i.test(m)) return m;
  return 'Request could not be completed. Check your details and try again.';
};

export default async request => {
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) return reply({error:'Backend not configured in Netlify'},503);
  const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const action=new URL(request.url).searchParams.get('action');
  try {
    if(request.method==='GET' && action==='catalogue') {
      const [p,v,l]=await Promise.all([
        db.from('products').select('id,sku,name,description,volume_ml,is_active').eq('is_active',true).eq('sku','BW-30ML').limit(1),
        db.from('product_packages').select('id,product_id,code,sku,label,vials_per_pack,stock_kind,price_cents,active,max_per_request').order('vials_per_pack'),
        db.from('inventory_lots').select('product_id,status,expiry_date,loose_on_hand,loose_reserved,sealed_on_hand,sealed_reserved')
      ]);
      for(const r of [p,v,l]) if(r.error) throw r.error;
      const product=p.data?.[0]||null;
      const stock=(l.data||[]).filter(lot=>lot.product_id===product?.id);
      const counts=packageAvailability((v.data||[]).filter(q=>q.product_id===product?.id),stock);
      const packages=(v.data||[]).filter(q=>q.product_id===product?.id).map(q=>({...q,available_packages:counts.byId[q.id]??0}));
      return reply({product,packages,stock:{loose:counts.loose,sealed:counts.sealed}});
    }
    if(request.method!=='POST') return reply({error:'Method not allowed'},405);
    const auth=request.headers.get('authorization')||'';
    if(!auth.startsWith('Bearer ')) return reply({error:'Sign in is required'},401);
    const {data:{user},error:authError}=await db.auth.getUser(auth.slice(7));
    if(authError||!user?.email_confirmed_at) return reply({error:'A verified account is required'},401);
    let body;
    try { const raw=await request.text(); if(raw.length>16000) return reply({error:'Request too large'},413);
      body=JSON.parse(raw||'{}'); if(!body||Array.isArray(body)||typeof body!=='object') throw Error(); }
    catch {return reply({error:'Invalid request data'},400);}

    if(action==='submit-order') {
      const secureSubtotal=await secureDomesticSubtotal(db,body.items);
      const promoCode=String(body.promo_code||'').trim();
      const promoResult=promoCode?await validatePromo(db,promoCode,secureSubtotal):null;
      if(promoCode&&!promoResult) return reply({error:'Promo code is invalid or unavailable. Review your total before submitting.'},409);
      if(promoResult){
        const currentUses=Number(promoResult.promo.uses_count||0);
        const {data:claimed,error:claimError}=await db.from('promo_codes')
          .update({uses_count:currentUses+1,updated_at:new Date().toISOString()})
          .eq('id',promoResult.promo.id).eq('uses_count',currentUses).select('id').maybeSingle();
        if(claimError) throw claimError;
        if(!claimed) throw new Error('Promo code is invalid or unavailable');
      }
      let orderId=null;
      try {
        const {data,error}=await db.rpc('service_submit_order_v2',{
          p_customer_id:user.id,p_email:user.email,p_name:body.name,p_shipping:body.shipping,
          p_items:body.items,p_notes:body.notes||''
        });
        if(error) throw error;
        orderId=data;
        const orderUpdate={payment_method:'etransfer',payment_status:'not_requested'};
        if(promoResult){
          orderUpdate.promo_code=promoResult.promo.code;
          orderUpdate.promo_discount_cents=promoResult.discount;
          orderUpdate.promo_discount_currency='CAD';
        }
        const {error:updateError}=await db.from('orders').update(orderUpdate).eq('id',orderId);
        if(updateError) throw updateError;
      } catch(e) {
        if(promoResult){
          const expected=Number(promoResult.promo.uses_count||0)+1;
          await db.from('promo_codes').update({uses_count:Math.max(0,expected-1),updated_at:new Date().toISOString()})
            .eq('id',promoResult.promo.id).eq('uses_count',expected);
        }
        if(orderId){
          await db.from('order_items').delete().eq('order_id',orderId);
          await db.from('orders').delete().eq('id',orderId);
        }
        throw e;
      }
      return reply({order_id:orderId,promo:promoResult?{code:promoResult.promo.code,discount_cents:promoResult.discount,final_subtotal_cents:promoResult.final}:null,message:'Request received. Payment is not due until the request is approved.'});
    }

    if(action==='payment-instructions'){
      const orderId=String(body.order_id||'');
      const {data:order,error}=await db.from('orders').select('*').eq('id',orderId).eq('customer_id',user.id).maybeSingle();
      if(error) throw error;
      if(!order) return reply({error:'Order not found'},404);
      if(!['awaiting_payment','paid'].includes(order.payment_status)) return reply({error:'Payment has not been requested for this order'},409);
      const settings=await loadPaymentSettings(db);
      return reply({instructions:paymentInstructions(order,settings)});
    }

    const {data:admin,error:adminErr}=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
    if(adminErr) throw adminErr;
    if(!admin) return reply({error:'Administrator access required'},403);
    const rpc=async(name,params)=>{const {data,error}=await db.rpc(name,params);if(error)throw error;return data;};

    if(action==='dashboard') {
      // Core operations must stay available even if a newer optional module has not
      // been migrated yet. Promo/payment/referral features are loaded independently
      // and report their own migration warning instead of taking down /admin.
      const [pr,pk,lo,ord,ev,alloc,prices]=await Promise.all([
        db.from('products').select('*').eq('sku','BW-30ML'),
        db.from('product_packages').select('*').order('vials_per_pack'),
        db.from('inventory_lots').select('*').order('expiry_date'),
        db.from('orders').select('*,order_items(*)').order('created_at',{ascending:false}).limit(150),
        db.from('inventory_events_v2').select('*').order('created_at',{ascending:false}).limit(150),
        db.from('order_allocations_v2').select('*').order('created_at',{ascending:false}).limit(250),
        db.from('package_price_events_v2').select('*').order('created_at',{ascending:false}).limit(50)
      ]);
      for(const r of [pr,pk,lo,ord,ev,alloc,prices]) if(r.error) throw r.error;

      const moduleWarnings=[];
      const optionalModule=async(id,label,migration,promise,fallback)=>{
        try{
          const result=await promise;
          if(result?.error) throw result.error;
          return result?.data ?? fallback;
        }catch(error){
          moduleWarnings.push({id,label,migration,message:`${label} is not initialized in the current database schema.`});
          return fallback;
        }
      };

      const [promos,paymentSettings,shippingProfiles]=await Promise.all([
        optionalModule('promos','Promo codes','supabase/006_promo_codes.sql',
          db.from('promo_codes').select('id,code,discount_type,discount_value,min_subtotal_cents,max_uses,uses_count,starts_on,ends_on,active,internal_note,created_at,updated_at').order('created_at',{ascending:false}),[]),
        optionalModule('payments','Payment methods','supabase/008_manual_payments.sql',
          db.from('payment_settings').select('id,etransfer_enabled,etransfer_email,etransfer_recipient_name,etransfer_note,usdc_eth_enabled,usdc_eth_address,usdc_note,updated_at').eq('id',1).maybeSingle(),null),
        optionalModule('shipping','Chit Chats shipping','supabase/010_chitchats_shipping.sql',
          db.from('shipping_profiles').select('*').order('market').order('vial_quantity',{ascending:true,nullsFirst:false}),[])
      ]);
      // One concise warning per module.
      const warnings=[...new Map(moduleWarnings.map(w=>[w.id,w])).values()];
      const inventoryCounts=packageAvailability(pk.data||[],lo.data||[]);
      return reply({products:pr.data,packages:pk.data,lots:lo.data,packageAvailability:inventoryCounts.byId,orders:ord.data,
        movements:ev.data,allocations:alloc.data,priceEvents:prices.data,promos,paymentSettings,
        referrals:[],referralRewards:[],shippingProfiles,chitchats:{configured:chitChatsConfigured(),environment:chitChatsEnvironment()},
        emailDelivery:{provider:'resend',configured:resendConfig().configured},moduleWarnings:warnings});
    }
    if(action==='orders-page') {
      const offset=Math.max(0,Math.min(100000,Number.isInteger(body.offset)?body.offset:0));
      const pageSize=100;
      const {data,error}=await db.from('orders').select('*,order_items(*)')
        .order('created_at',{ascending:false}).range(offset,offset+pageSize-1);
      if(error) throw error;
      return reply({orders:data||[],next_offset:offset+(data?.length||0),has_more:(data||[]).length===pageSize});
    }
    if(action==='save-package') {await rpc('service_admin_set_package_v2',{
      p_package_id:body.package_id,p_price_cents:body.price_cents??null,p_active:!!body.active,
      p_max_per_request:body.max_per_request,p_actor:user.id});return reply({ok:true});}
    if(action==='receive-lot') {const id=await rpc('service_admin_receive_lot_v2',{
      p_product_id:body.product_id,p_lot_code:body.lot_code,p_expiry:body.expiry_date,
      p_supplier:body.supplier_reference,p_location:body.location||'',
      p_loose:body.loose_count,p_sealed:body.sealed_count,p_actor:user.id});return reply({id});}
    if(action==='update-lot') {await rpc('service_admin_update_lot_v2',{
      p_lot_id:body.lot_id,p_lot_code:body.lot_code,p_expiry:body.expiry_date,
      p_supplier:body.supplier_reference,p_location:body.location||'',p_status:body.status,p_actor:user.id});return reply({ok:true});}
    if(action==='adjust-lot') {await rpc('service_admin_adjust_lot_v2',{
      p_lot_id:body.lot_id,p_loose_delta:body.loose_delta,p_sealed_delta:body.sealed_delta,
      p_reason:body.reason,p_actor:user.id});return reply({ok:true});}
    if(action==='open-case') {await rpc('service_admin_open_case_v2',{p_lot_id:body.lot_id,p_actor:user.id});return reply({ok:true});}
    if(action==='order-status') {
      if(body.status==='fulfilled'){
        const {data:order,error}=await db.from('orders').select('id,payment_method,payment_status').eq('id',body.order_id).maybeSingle();
        if(error) throw error;
        if(order?.payment_method && order.payment_status!=='paid') return reply({error:'Payment must be marked paid before fulfillment'},409);
      }
      await rpc('service_admin_order_transition_v2',{p_order_id:body.order_id,p_status:body.status,p_actor:user.id});
      if(body.status==='cancelled') await db.from('orders').update({payment_status:'cancelled'}).eq('id',body.order_id).neq('payment_status','paid');
      return reply({ok:true});
    }
    if(action==='manual-order') {const id=await rpc('service_admin_manual_order_v2',{
      p_name:body.name,p_email:body.email,p_package_id:body.package_id,p_quantity:body.quantity,
      p_notes:body.notes||'',p_actor:user.id});return reply({order_id:id});}
    if(action==='save-promo') {
      const id=body.id?String(body.id):null;
      const code=normalizePromoCode(body.code);
      const type=String(body.discount_type||'');
      const value=Number(body.discount_value);
      const minimum=Number(body.min_subtotal_cents||0);
      const maxUses=body.max_uses==null||body.max_uses===''?null:Number(body.max_uses);
      const starts=body.starts_on||null,ends=body.ends_on||null;
      if(!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)) return reply({error:'Promo code must be 3-32 characters using letters, numbers, hyphens or underscores'},400);
      if(!['percentage','fixed'].includes(type) || !Number.isInteger(value) || value<=0 || (type==='percentage'&&value>100)) return reply({error:'Invalid promo discount'},400);
      if(!Number.isInteger(minimum)||minimum<0|| (maxUses!=null&&(!Number.isInteger(maxUses)||maxUses<1))) return reply({error:'Invalid promo limits'},400);
      if((starts&&!/^\d{4}-\d{2}-\d{2}$/.test(starts))||(ends&&!/^\d{4}-\d{2}-\d{2}$/.test(ends))||(starts&&ends&&ends<starts)) return reply({error:'Invalid promo date range'},400);
      const payload={code,discount_type:type,discount_value:value,currency:'CAD',min_subtotal_cents:minimum,max_uses:maxUses,starts_on:starts,ends_on:ends,active:!!body.active,internal_note:String(body.internal_note||'').slice(0,300),updated_at:new Date().toISOString()};
      let result;
      if(id) result=await db.from('promo_codes').update(payload).eq('id',id).select('*').single();
      else result=await db.from('promo_codes').insert(payload).select('*').single();
      if(result.error) throw result.error;
      return reply({promo:result.data});
    }
    if(action==='save-referral') return reply({error:'The referral program is temporarily disabled while it is being upgraded.'},410);

    if(action==='save-shipping-profile'){
      const id=body.id?String(body.id):null;
      const packageId=String(body.package_id||'');
      const active=!!body.active;
      const weight=body.weight_g===''||body.weight_g==null?null:Number(body.weight_g);
      const length=body.length_cm===''||body.length_cm==null?null:Number(body.length_cm);
      const width=body.width_cm===''||body.width_cm==null?null:Number(body.width_cm);
      const height=body.height_cm===''||body.height_cm==null?null:Number(body.height_cm);
      const dims=[weight,length,width,height];
      if(!packageId) return reply({error:'Select a Canadian package'},400);
      if(dims.some(v=>v!=null&&(!(v>0)||v>100000))) return reply({error:'Packed weight and dimensions must be positive numbers'},400);
      if(active&&dims.some(v=>!(v>0))) return reply({error:'Enter packed weight and all dimensions before enabling live rates'},400);
      const payload={package_id:packageId,label:String(body.label||'').trim().slice(0,120),package_type:'parcel',weight_g:weight,length_cm:length,width_cm:width,height_cm:height,active,updated_at:new Date().toISOString()};
      let result;
      if(id) result=await db.from('shipping_profiles').update(payload).eq('id',id).select('*').single();
      else result=await db.from('shipping_profiles').insert(payload).select('*').single();
      if(result.error) throw result.error;
      return reply({profile:result.data});
    }

    if(action==='save-payment-settings'){
      const etransferEnabled=!!body.etransfer_enabled;
      const etransferEmail=String(body.etransfer_email||'').trim();
      const recipient=String(body.etransfer_recipient_name||'').trim().slice(0,120);
      const etransferNote=String(body.etransfer_note||'').trim().slice(0,500);
      const usdcEnabled=!!body.usdc_eth_enabled;
      const usdcAddress=String(body.usdc_eth_address||'').trim();
      const usdcNote=String(body.usdc_note||'').trim().slice(0,500);
      if(etransferEnabled && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(etransferEmail)||!recipient)) return reply({error:'Enter a valid Interac e-Transfer email and recipient name'},400);
      if(usdcEnabled && !isEthAddress(usdcAddress)) return reply({error:'Enter a valid Ethereum wallet address for USDC'},400);
      const payload={id:1,etransfer_enabled:etransferEnabled,etransfer_email:etransferEmail,etransfer_recipient_name:recipient,etransfer_note:etransferNote,usdc_eth_enabled:usdcEnabled,usdc_eth_address:usdcAddress,usdc_note:usdcNote,updated_by:user.id,updated_at:new Date().toISOString()};
      const {data,error}=await db.from('payment_settings').upsert(payload,{onConflict:'id'}).select('*').single();
      if(error) throw error;
      return reply({settings:data});
    }
    if(action==='request-payment'){
      const orderId=String(body.order_id||'');
      const {data:order,error}=await db.from('orders').select('*').eq('id',orderId).maybeSingle();
      if(error) throw error;
      if(!order) return reply({error:'Order not found'},404);
      if(order.status!=='approved') return reply({error:'Payment can only be requested after approval'},409);
      if(order.payment_status==='awaiting_payment') return reply({error:'Payment has already been requested. Use Resend payment email instead.'},409);
      if(order.payment_status==='paid') return reply({error:'Payment has already been confirmed for this order'},409);
      const method=order.market==='international'?'usdc_eth':'etransfer';
      const currency=order.market==='international'?'USD':'CAD';
      const settings=await loadPaymentSettings(db);
      if(method==='etransfer' && (!settings.etransfer_enabled||!settings.etransfer_email)) return reply({error:'Interac e-Transfer is not enabled in Payment methods'},409);
      if(method==='usdc_eth' && (!settings.usdc_eth_enabled||!isEthAddress(settings.usdc_eth_address))) return reply({error:'USDC on Ethereum is not enabled in Payment methods'},409);
      if(method==='etransfer' && !resendConfig().configured) return reply({error:'Transactional email is not configured in Netlify. Add RESEND_API_KEY and RESEND_FROM_EMAIL before requesting e-Transfer payment.'},409);
      const netProduct=Math.max(0,Number(order.subtotal_cents||0)-Number(order.promo_discount_cents||0)-Number(order.referral_reward_discount_cents||0));
      const amount=netProduct+Number(order.shipping_cents||0);
      if(amount<=0||amount>100000000) return reply({error:'Payment amount is invalid'},400);
      const reference=String(order.order_number||order.id).slice(0,80);
      const requestedAt=new Date().toISOString();
      const {data:updated,error:updateError}=await db.from('orders').update({payment_method:method,payment_status:'awaiting_payment',payment_amount_cents:amount,payment_currency:currency,payment_reference:reference,payment_requested_at:requestedAt,payment_tx_hash:null,paid_at:null}).eq('id',order.id).select('*').single();
      if(updateError) throw updateError;
      const instructions=paymentInstructions(updated,settings);
      if(method==='etransfer'){
        try{
          const email=paymentRequestEmail(updated,instructions);
          const sent=await sendResendEmail({...email,to:updated.customer_email,idempotencyKey:`payment-request-${updated.id}-${amount}`});
          return reply({instructions,email_sent:true,email_id:sent?.id||null});
        }catch(emailError){
          console.error('Payment request email failed',updated.id,emailError?.message||'');
          const {error:rollbackError}=await db.from('orders').update({payment_status:order.payment_status||'not_requested',payment_amount_cents:order.payment_amount_cents??null,payment_currency:order.payment_currency??null,payment_reference:order.payment_reference??null,payment_requested_at:order.payment_requested_at??null,payment_tx_hash:order.payment_tx_hash??null,paid_at:order.paid_at??null}).eq('id',order.id);
          if(rollbackError) console.error('Payment request rollback failed',order.id,rollbackError.message||'');
          return reply({error:rollbackError?'Payment email failed and the order state could not be rolled back automatically. Review this order before retrying.':'Payment email could not be sent. The order was returned to Not requested. Check the Resend API key and verified sender domain.'},502);
        }
      }
      return reply({instructions,email_sent:false});
    }
    if(action==='resend-payment-email'){
      const orderId=String(body.order_id||'');
      const {data:order,error}=await db.from('orders').select('*').eq('id',orderId).maybeSingle();
      if(error) throw error;
      if(!order) return reply({error:'Order not found'},404);
      if(order.status!=='approved'||order.payment_status!=='awaiting_payment'||order.payment_method!=='etransfer') return reply({error:'Only an approved e-Transfer order awaiting payment can resend payment instructions'},409);
      const settings=await loadPaymentSettings(db);
      const instructions=paymentInstructions(order,settings);
      const email=paymentRequestEmail(order,instructions);
      try{
        const sent=await sendResendEmail({...email,to:order.customer_email});
        return reply({ok:true,email_sent:true,email_id:sent?.id||null});
      }catch(emailError){
        console.error('Payment email resend failed',order.id,emailError?.message||'');
        return reply({error:'Payment email could not be resent. Check the Resend configuration and sender domain.'},502);
      }
    }
    if(action==='mark-payment-paid'){
      const orderId=String(body.order_id||'');
      const {data:order,error}=await db.from('orders').select('*').eq('id',orderId).maybeSingle();
      if(error) throw error;
      if(!order) return reply({error:'Order not found'},404);
      if(order.payment_status!=='awaiting_payment') return reply({error:'Payment is not awaiting confirmation'},409);
      const reference=String(body.reference||'').trim().slice(0,160);
      const txHash=String(body.tx_hash||'').trim();
      if(order.payment_method==='usdc_eth'&&!isEthTxHash(txHash)) return reply({error:'Enter the verified Ethereum transaction hash'},400);
      const paidAt=new Date().toISOString();
      const paymentReference=reference||order.payment_reference||order.order_number;
      const {data:updated,error:updateError}=await db.from('orders').update({payment_status:'paid',payment_reference:paymentReference,payment_tx_hash:order.payment_method==='usdc_eth'?txHash:null,paid_at:paidAt}).eq('id',order.id).select('*').single();
      if(updateError) throw updateError;
      if(updated.payment_method==='etransfer'){
        try{
          const email=paymentReceivedEmail(updated);
          const sent=await sendResendEmail({...email,to:updated.customer_email,idempotencyKey:`payment-paid-${updated.id}`});
          return reply({ok:true,email_sent:true,email_id:sent?.id||null});
        }catch(emailError){
          console.error('Payment received email failed',updated.id,emailError?.message||'');
          return reply({ok:true,email_sent:false,warning:'Payment was marked paid, but the confirmation email could not be sent. Check Resend before contacting the customer.'});
        }
      }
      return reply({ok:true,email_sent:false});
    }
    return reply({error:'Unknown action'},404);
  } catch(e) {
    console.error('Recon Water API',action,e?.code||'',e?.message||'');
    return reply({error:safeError(e)},400);
  }
};
