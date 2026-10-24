import { createClient } from '@supabase/supabase-js';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(body),
});

function getAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server environment is not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function getBearer(event) {
  const header = event.headers?.authorization || event.headers?.Authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function requireAdmin(db, event) {
  const token = getBearer(event);
  if (!token) return { error: 'Authentication required.', status: 401 };

  const { data: authData, error: authError } = await db.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) return { error: 'Invalid or expired session.', status: 401 };

  // Recon Water's earlier backend used public.admin_users. The check is tolerant of
  // the historical user_id/id/email shapes so this rebuild does not create a second admin system.
  const { data: adminRows, error: adminError } = await db.from('admin_users').select('*').limit(250);
  if (adminError) return { error: 'Admin authorization table is unavailable.', status: 500 };

  const allowed = (adminRows || []).some(row =>
    row.user_id === user.id || row.id === user.id ||
    (row.email && user.email && String(row.email).toLowerCase() === String(user.email).toLowerCase())
  );
  if (!allowed) return { error: 'Admin access required.', status: 403 };
  return { user };
}

function packageAvailability(pack, lots) {
  const eligible = (lots || []).filter(lot => lot.status === 'available' && lot.expiry_date && new Date(`${lot.expiry_date}T23:59:59Z`) > new Date());
  if (pack.stock_kind === 'sealed') {
    return eligible.reduce((sum, lot) => sum + Math.max(0, Number(lot.sealed_on_hand || 0) - Number(lot.sealed_reserved || 0)), 0);
  }
  if (Number(pack.vials_per_pack) > 1) {
    return eligible.reduce((sum, lot) => {
      const free = Math.max(0, Number(lot.loose_on_hand || 0) - Number(lot.loose_reserved || 0));
      return sum + Math.floor(free / Number(pack.vials_per_pack));
    }, 0);
  }
  return eligible.reduce((sum, lot) => sum + Math.max(0, Number(lot.loose_on_hand || 0) - Number(lot.loose_reserved || 0)), 0);
}

async function loadCatalogue(db, includeInactive = false) {
  const { data: product, error: productError } = await db
    .from('products')
    .select('id,sku,name,is_active')
    .eq('sku', 'BW-30ML')
    .maybeSingle();
  if (productError) throw productError;
  if (!product) throw new Error('Recon Water product BW-30ML was not found.');

  let packageQuery = db
    .from('product_packages')
    .select('id,product_id,code,sku,label,vials_per_pack,stock_kind,price_cents,active,max_per_request,updated_at')
    .eq('product_id', product.id);
  if (!includeInactive) packageQuery = packageQuery.eq('active', true).not('price_cents', 'is', null);

  const [{ data: packages, error: packageError }, { data: lots, error: lotError }] = await Promise.all([
    packageQuery,
    db.from('inventory_lots').select('id,product_id,lot_code,expiry_date,status,loose_on_hand,loose_reserved,sealed_on_hand,sealed_reserved,location,updated_at').eq('product_id', product.id),
  ]);
  if (packageError) throw packageError;
  if (lotError) throw lotError;

  const order = { single: 1, five: 2, ten: 3, case: 4 };
  const normalized = (packages || [])
    .sort((a, b) => (order[a.code] || 99) - (order[b.code] || 99))
    .map(pack => ({ ...pack, available_packs: packageAvailability(pack, lots || []) }));

  return { product, packages: normalized, lots: lots || [] };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});

  let db;
  try { db = getAdminClient(); }
  catch (error) { return json(503, { error: error.message }); }

  const mode = event.queryStringParameters?.mode || 'catalogue';

  try {
    if (event.httpMethod === 'GET' && mode === 'health') {
      const { error } = await db.from('products').select('id').limit(1);
      return error ? json(503, { connected: false, error: error.message }) : json(200, { connected: true });
    }

    if (event.httpMethod === 'GET' && mode === 'catalogue') {
      const data = await loadCatalogue(db, false);
      return json(200, data);
    }

    if (event.httpMethod === 'GET' && mode === 'admin') {
      const auth = await requireAdmin(db, event);
      if (auth.error) return json(auth.status, { error: auth.error });
      const catalogue = await loadCatalogue(db, true);
      const { data: orders, error: orderError } = await db
        .from('orders')
        .select('id,order_number,customer_name,customer_email,status,subtotal_cents,created_at,updated_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (orderError) throw orderError;
      return json(200, { ...catalogue, orders: orders || [], admin: { id: auth.user.id, email: auth.user.email } });
    }

    if (event.httpMethod === 'POST' && mode === 'set-package') {
      const auth = await requireAdmin(db, event);
      if (auth.error) return json(auth.status, { error: auth.error });
      const body = JSON.parse(event.body || '{}');
      const packageId = String(body.package_id || '');
      const priceCents = body.price_cents == null ? null : Number(body.price_cents);
      const active = Boolean(body.active);
      const maxPerRequest = Number(body.max_per_request || 10);
      if (!packageId || (priceCents != null && (!Number.isInteger(priceCents) || priceCents < 1))) return json(400, { error: 'Invalid package pricing.' });
      const { error } = await db.rpc('service_admin_set_package_v2', {
        p_package_id: packageId,
        p_price_cents: priceCents,
        p_active: active,
        p_max_per_request: maxPerRequest,
        p_actor: auth.user.id,
      });
      if (error) throw error;
      return json(200, { ok: true });
    }

    return json(404, { error: 'Endpoint not found.' });
  } catch (error) {
    console.error('Recon API error:', error);
    return json(500, { error: error?.message || 'Unexpected server error.' });
  }
}
