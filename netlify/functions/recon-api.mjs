import { createClient } from '@supabase/supabase-js';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(body),
});


const normalizePromoCode = value => String(value || '').trim().toUpperCase();
const promoDiscount = (promo, subtotal) => {
  const base = Math.max(0, Number(subtotal || 0));
  if (promo.discount_type === 'percentage') return Math.min(base, Math.floor(base * Number(promo.discount_value) / 100));
  return Math.min(base, Number(promo.discount_value || 0));
};
async function validateDomesticPromo(db, rawCode, subtotalCents) {
  const code = normalizePromoCode(rawCode);
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)) return null;
  const { data: promo, error } = await db.from('promo_codes').select('*').eq('code', code).eq('active', true).maybeSingle();
  if (error) throw error;
  const today = new Date().toISOString().slice(0, 10);
  if (!promo || (promo.starts_on && promo.starts_on > today) || (promo.ends_on && promo.ends_on < today) ||
      (promo.max_uses != null && Number(promo.uses_count || 0) >= Number(promo.max_uses)) ||
      Number(subtotalCents || 0) < Number(promo.min_subtotal_cents || 0)) return null;
  const discount = promoDiscount(promo, subtotalCents);
  if (discount <= 0) return null;
  return { promo, discount, final: Math.max(0, Number(subtotalCents) - discount) };
}

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

    if (event.httpMethod === 'POST' && mode === 'promo-validate') {
      let body;
      try { body = JSON.parse(event.body || '{}'); }
      catch { return json(400, { error: 'Invalid request data.' }); }
      const packageId = String(body.package_id || '');
      const code = normalizePromoCode(body.code);
      if (!packageId || !code) return json(400, { error: 'Enter a valid promo code.' });
      const { data: pack, error: packError } = await db.from('product_packages')
        .select('id,price_cents,active').eq('id', packageId).eq('active', true).maybeSingle();
      if (packError) throw packError;
      if (!pack || pack.price_cents == null) return json(400, { error: 'Promo code could not be applied.' });
      const result = await validateDomesticPromo(db, code, Number(pack.price_cents));
      if (!result) return json(400, { error: 'Promo code is invalid or unavailable.' });
      return json(200, {
        code: result.promo.code,
        discount_type: result.promo.discount_type,
        discount_value: result.promo.discount_value,
        discount_cents: result.discount,
        subtotal_cents: Number(pack.price_cents),
        final_subtotal_cents: result.final,
      });
    }

    if (event.httpMethod === 'POST' && mode === 'submit-international') {
      let body;
      try { body = JSON.parse(event.body || '{}'); }
      catch { return json(400, { error: 'Invalid request data.' }); }

      const quantity = Number(body.quantity);
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim();
      const notes = String(body.notes || '');
      const shipping = body.shipping && typeof body.shipping === 'object' && !Array.isArray(body.shipping) ? body.shipping : null;

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5) {
        return json(400, { error: 'International orders are limited to 1–5 vials.' });
      }
      if (name.length < 2 || name.length > 100 || email.length < 5 || email.length > 200 || !email.includes('@') || notes.length > 500) {
        return json(400, { error: 'Invalid customer details.' });
      }
      if (!shipping) return json(400, { error: 'A complete international delivery address is required.' });

      const address = String(shipping.address || '').trim();
      const city = String(shipping.city || '').trim();
      const region = String(shipping.region || '').trim();
      const postal = String(shipping.postal || '').trim();
      const country = String(shipping.country || '').trim();
      if (address.length < 5 || city.length < 2 || region.length < 1 || postal.length < 2 || country.length < 2 || JSON.stringify(shipping).length > 1200) {
        return json(400, { error: 'A complete international delivery address is required.' });
      }
      if (['canada', 'ca', 'can'].includes(country.toLowerCase())) {
        return json(400, { error: 'Canadian addresses must use the domestic ordering flow.' });
      }

      const recentCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count: recentCount, error: recentError } = await db
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('market', 'international')
        .ilike('customer_email', email)
        .gt('created_at', recentCutoff);
      if (recentError) throw recentError;
      if (Number(recentCount || 0) >= 3) return json(429, { error: 'Too many recent international requests.' });

      const { data: product, error: productError } = await db
        .from('products')
        .select('id,name')
        .eq('sku', 'BW-30ML')
        .eq('is_active', true)
        .maybeSingle();
      if (productError) throw productError;
      if (!product) return json(409, { error: 'Product unavailable.' });

      const { data: singlePack, error: packError } = await db
        .from('product_packages')
        .select('id')
        .eq('product_id', product.id)
        .eq('code', 'single')
        .maybeSingle();
      if (packError) throw packError;
      if (!singlePack) return json(409, { error: 'International format unavailable.' });

      const today = new Date().toISOString().slice(0, 10);
      const { data: lots, error: lotsError } = await db
        .from('inventory_lots')
        .select('loose_on_hand,loose_reserved')
        .eq('product_id', product.id)
        .eq('status', 'available')
        .gt('expiry_date', today);
      if (lotsError) throw lotsError;
      const freeLoose = (lots || []).reduce((sum, lot) => sum + Math.max(0, Number(lot.loose_on_hand || 0) - Number(lot.loose_reserved || 0)), 0);
      if (freeLoose < quantity) return json(409, { error: 'Insufficient inventory for selected quantity.' });

      // Fixed international commercial rules are defined only here on the server.
      const unitPriceCents = 2000; // USD $20.00 per vial
      const shippingCents = 3000; // USD $30.00 flat delivery

      const { data: order, error: orderError } = await db
        .from('orders')
        .insert({
          customer_name: name,
          customer_email: email,
          shipping,
          notes,
          status: 'pending_review',
          subtotal_cents: quantity * unitPriceCents,
          market: 'international',
          subtotal_currency: 'USD',
          shipping_cents: shippingCents,
          shipping_currency: 'USD',
        })
        .select('id,order_number')
        .single();
      if (orderError) throw orderError;

      const { error: itemError } = await db.from('order_items').insert({
        order_id: order.id,
        product_id: product.id,
        product_name: product.name,
        sku: 'RW-INTL-BAC-01',
        quantity,
        unit_price_cents: unitPriceCents,
        package_id: singlePack.id,
        package_label: 'International single vial',
        vials_per_pack: 1,
        stock_kind: 'loose',
      });
      if (itemError) {
        await db.from('orders').delete().eq('id', order.id);
        throw itemError;
      }

      return json(200, { order_id: order.id, order_number: order.order_number || null });
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
