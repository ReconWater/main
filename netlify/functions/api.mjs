import { createClient } from '@supabase/supabase-js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});

export default async (request) => {
  if (request.method !== 'POST') return json({error:'Method not allowed'},405);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json({error:'Backend not configured. Add server-side Supabase variables in Netlify.'},503);
  const db = createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const action = new URL(request.url).searchParams.get('action');
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return json({error:'Please sign in'},401);
  const {data:{user},error:authError} = await db.auth.getUser(token);
  if (authError || !user || !user.email_confirmed_at) return json({error:'Please sign in with a verified email address'},401);
  let body;
  try {
    const raw = await request.text();
    if(raw.length > 16000) return json({error:'Request too large'},413);
    body = JSON.parse(raw || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
  } catch { return json({error:'Invalid JSON request'},400); }

  try {
    if (action === 'submit-order') {
      const {data,error} = await db.rpc('service_submit_order',{
        p_customer_id:user.id,p_email:user.email,p_name:body.name,
        p_shipping:body.shipping,p_items:body.items,p_notes:body.notes || ''
      });
      if (error) throw error;
      return json({order_id:data,message:'Order request received for review. No payment has been collected.'});
    }

    const {data:admin,error:adminError} = await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
    if (adminError) throw adminError;
    if (!admin) return json({error:'Administrator access required'},403);

    if (action === 'dashboard') {
      const [products,orders,movements] = await Promise.all([
        db.from('products').select('*').order('name'),
        db.from('orders').select('*,order_items(*)').order('created_at',{ascending:false}).limit(150),
        db.from('inventory_movements').select('*,products(name,sku)').order('created_at',{ascending:false}).limit(100)
      ]);
      for(const result of [products,orders,movements]) if(result.error) throw result.error;
      return json({products:products.data,orders:orders.data,movements:movements.data});
    }
    if (action === 'save-product') {
      const {data,error} = await db.rpc('service_admin_save_product',{
        p_id:body.id || null,p_sku:body.sku,p_name:body.name,p_description:body.description || '',
        p_volume_ml:body.volume_ml ?? null,p_price_cents:body.price_cents ?? null,
        p_active:!!body.is_active,p_threshold:body.low_stock_threshold ?? 5
      });
      if(error) throw error;
      return json({id:data});
    }
    if (action === 'set-stock') {
      const {error} = await db.rpc('service_admin_set_stock',{
        p_product_id:body.product_id,p_quantity:body.quantity,p_actor:user.id,p_reason:body.reason
      });
      if(error) throw error;
      return json({ok:true});
    }
    if (action === 'order-status') {
      const {error} = await db.rpc('service_admin_change_order_status',{
        p_order_id:body.order_id,p_status:body.status,p_actor:user.id
      });
      if(error) throw error;
      return json({ok:true});
    }
    if (action === 'manual-order') {
      const {data,error} = await db.rpc('service_admin_place_order',{
        p_name:body.name,p_email:body.email,p_product_id:body.product_id,
        p_quantity:body.quantity,p_notes:body.notes || '',p_actor:user.id
      });
      if(error) throw error;
      return json({order_id:data});
    }
    return json({error:'Unknown action'},404);
  } catch(error) {
    // Do not leak SQL internals or customer data to API callers.
    const msg = String(error?.message || 'Request failed');
    const safe = /^(Invalid|Insufficient|Too many|Product not|Product not available|Set a price|This order|Order not|Quantity|Duplicate|Select between|A complete|A verified|A complete|A verified|A verified|A complete)/i.test(msg)
      ? msg : 'Request could not be completed. Review the fields and try again.';
    console.error('Hospira API',action,error?.code || '',msg);
    return json({error:safe},400);
  }
};
