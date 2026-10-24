import { createClient } from '@supabase/supabase-js';
import {packageAvailability} from '../../src/availability.js';

const reply = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const safeError = e => {
  const m=String(e?.message||'Request failed');
  if (/^(Invalid|Insufficient|Too many|Package|Product|Order not|Legacy|No eligible|Cannot adjust|Expired|Allocated lot|Duplicate|Request exceeds|Select up|Request total|International|Destination)/i.test(m)) return m;
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
      const singlePack=(v.data||[]).find(q=>q.product_id===product?.id&&q.code==='single');
      const international={active:!!product&&!!singlePack,price_cents:2000,currency:'USD',max_per_request:5,available_packages:Math.min(5,counts.loose)};
      return reply({product,packages,international,stock:{loose:counts.loose,sealed:counts.sealed}});
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
      const {data,error}=await db.rpc('service_submit_order_v2',{
        p_customer_id:user.id,p_email:user.email,p_name:body.name,p_shipping:body.shipping,
        p_items:body.items,p_notes:body.notes||''
      });
      if(error) throw error;
      return reply({order_id:data,message:'Request received. No payment has been collected and inventory is not reserved until approval.'});
    }
    if(action==='submit-international-order') {
      const {data,error}=await db.rpc('service_submit_international_order_v1',{
        p_customer_id:user.id,p_email:user.email,p_name:body.name,p_shipping:body.shipping,
        p_quantity:body.quantity,p_notes:body.notes||''
      });
      if(error) throw error;
      return reply({order_id:data,message:'International request received. Product pricing is $20 USD per vial and delivery is a flat $30 CAD. No payment has been collected.'});
    }
    const {data:admin,error:adminErr}=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
    if(adminErr) throw adminErr;
    if(!admin) return reply({error:'Administrator access required'},403);
    const rpc=async(name,params)=>{const {data,error}=await db.rpc(name,params);if(error)throw error;return data;};
    if(action==='dashboard') {
      const [pr,pk,lo,ord,ev,alloc,prices]=await Promise.all([
        db.from('products').select('*').eq('sku','BW-30ML'),
        db.from('product_packages').select('*').order('vials_per_pack'),
        db.from('inventory_lots').select('*').order('expiry_date'),
        db.from('orders').select('*,order_items(*)').order('created_at',{ascending:false}).limit(150),
        db.from('inventory_events_v2').select('*').order('created_at',{ascending:false}).limit(150),
        db.from('order_allocations_v2').select('*').order('created_at',{ascending:false}).limit(250),
        db.from('package_price_events_v2').select('*').order('created_at',{ascending:false}).limit(50)
      ]);
      for(const r of [pr,pk,lo,ord,ev,alloc,prices]) if(r.error)throw r.error;
      const inventoryCounts=packageAvailability(pk.data||[],lo.data||[]);
      return reply({products:pr.data,packages:pk.data,lots:lo.data,packageAvailability:inventoryCounts.byId,orders:ord.data,
        movements:ev.data,allocations:alloc.data,priceEvents:prices.data});
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
    if(action==='order-status') {await rpc('service_admin_order_transition_v2',{
      p_order_id:body.order_id,p_status:body.status,p_actor:user.id});return reply({ok:true});}
    if(action==='manual-order') {const id=await rpc('service_admin_manual_order_v2',{
      p_name:body.name,p_email:body.email,p_package_id:body.package_id,p_quantity:body.quantity,
      p_notes:body.notes||'',p_actor:user.id});return reply({order_id:id});}
    return reply({error:'Unknown action'},404);
  } catch(e) {
    console.error('Recon Water API',action,e?.code||'',e?.message||'');
    return reply({error:safeError(e)},400);
  }
};
