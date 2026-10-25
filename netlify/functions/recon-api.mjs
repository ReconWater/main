import { createClient } from '@supabase/supabase-js';
import { chitChatsConfigured, chitChatsEnvironment, getChitChatsRates } from './_chitchats.mjs';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

function dbClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server environment is not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const normalizeCode = value => String(value || '').trim().toUpperCase();
const validCode = value => /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(normalizeCode(value));
const cents = value => Math.round(Number(value || 0) * 100);
const FLAT_CANADA_RATE_CAD = 25;

function supabaseProjectIdentity() {
  const raw = String(process.env.SUPABASE_URL || '').trim();
  try {
    const url = new URL(raw);
    const host = url.hostname || '';
    const projectRef = host.endsWith('.supabase.co') ? host.split('.')[0] : host;
    return { project_ref: projectRef || null, host: host || null };
  } catch {
    return { project_ref: null, host: null };
  }
}

async function getReconShippingMode(db) {
  const { data, error } = await db.from('app_settings').select('value').eq('key', 'recon_shipping_mode').maybeSingle();
  if (error) throw error;
  const mode = String(data?.value?.mode || 'chitchats').trim().toLowerCase();
  return { mode: mode === 'flat_25' ? 'flat_25' : 'chitchats', flat_rate_cad: FLAT_CANADA_RATE_CAD };
}

function isMissingRelation(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === '42P01' || code === 'PGRST205' || /does not exist|schema cache|could not find the table/i.test(message);
}

async function requireReconAdmin(event, db, allowedProfileRoles = null) {
  const header = String(event.headers?.authorization || event.headers?.Authorization || '');
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw Object.assign(new Error('Administrator authentication required.'), { statusCode: 401 });

  const { data: authData, error: authError } = await db.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user?.id) throw Object.assign(new Error('Administrator session is invalid or expired.'), { statusCode: 401 });

  // Recon Water's established administrator system is public.admin_users. Keep
  // that as the primary authorization source so optional profile/RBAC tables do
  // not make the inventory or shipping modules unavailable.
  const { data: adminRows, error: adminError } = await db.from('admin_users').select('*').limit(250);
  if (!adminError) {
    const email = String(user.email || '').toLowerCase();
    const allowed = (adminRows || []).some(row =>
      row?.user_id === user.id || row?.id === user.id ||
      (row?.email && email && String(row.email).toLowerCase() === email)
    );
    if (allowed) return user;
    throw Object.assign(new Error('Administrator permission required.'), { statusCode: 403 });
  }
  if (!isMissingRelation(adminError)) throw adminError;

  // Compatibility fallback for deployments that migrated admin authorization to
  // public.profiles. A missing profiles relation is treated as an auth-schema
  // compatibility condition, not as a batch-inventory failure.
  const { data: profile, error: profileError } = await db.from('profiles').select('id,role,active').eq('id', user.id).maybeSingle();
  if (profileError) {
    if (isMissingRelation(profileError)) {
      throw Object.assign(new Error('Administrator authorization table is unavailable.'), { statusCode: 503 });
    }
    throw profileError;
  }
  const role = String(profile?.role || '').toLowerCase();
  if (!profile?.active || (allowedProfileRoles && !allowedProfileRoles.includes(role))) {
    throw Object.assign(new Error('Administrator permission required.'), { statusCode: 403 });
  }
  return user;
}

async function requireShippingAdmin(event, db) {
  return requireReconAdmin(event, db, ['owner','admin']);
}

async function requireInventoryAdmin(event, db) {
  return requireReconAdmin(event, db, ['owner','admin','fulfillment','manager']);
}

async function loadBatchState(db, productId, includeMovements = false) {
  // The packaging-aware v2 inventory schema is the authoritative Recon Water
  // ledger. Do not gate inventory on the later recon_inventory_* experiment.
  const { data: lots, error: lotsError } = await db.from('inventory_lots')
    .select('*').eq('product_id', productId).order('expiry_date', { ascending: true }).order('created_at', { ascending: true });
  if (lotsError) {
    if (isMissingRelation(lotsError)) return { installed: false, enabled: false, lots: [], movements: [] };
    throw lotsError;
  }

  let movements = [];
  if (includeMovements && (lots || []).length) {
    const lotIds = (lots || []).map(lot => lot.id).filter(Boolean);
    const { data, error } = await db.from('inventory_events_v2')
      .select('*').in('lot_id', lotIds).order('created_at', { ascending: false }).limit(120);
    if (error) {
      if (!isMissingRelation(error)) throw error;
    } else {
      movements = data || [];
    }
  }

  // v2 inventory_lots is already authoritative; it has no activation/config gate.
  return { installed: true, enabled: true, config: null, lots: lots || [], movements };
}

function batchSummary(lots = []) {
  const today = new Date().toISOString().slice(0,10);
  let looseOnHand=0,looseReserved=0,looseAvailable=0,sealedOnHand=0,sealedReserved=0,sealedAvailable=0;
  for (const lot of lots) {
    looseOnHand += Number(lot.loose_on_hand || 0);
    looseReserved += Number(lot.loose_reserved || 0);
    sealedOnHand += Number(lot.sealed_on_hand || 0);
    sealedReserved += Number(lot.sealed_reserved || 0);
    const eligible = lot.status === 'available' && lot.expiry_date && lot.expiry_date >= today;
    if (eligible) {
      looseAvailable += Math.max(0, Number(lot.loose_on_hand || 0) - Number(lot.loose_reserved || 0));
      sealedAvailable += Math.max(0, Number(lot.sealed_on_hand || 0) - Number(lot.sealed_reserved || 0));
    }
  }
  return { loose_on_hand:looseOnHand,loose_reserved:looseReserved,loose_available:looseAvailable,sealed_on_hand:sealedOnHand,sealed_reserved:sealedReserved,sealed_available:sealedAvailable,total_vial_equivalent:looseOnHand+(sealedOnHand*25),available_vial_equivalent:looseAvailable+(sealedAvailable*25) };
}

async function findReconProduct(db) {
  // Prefer an explicit product id when configured; otherwise resolve the stable
  // Recon Water product directly from public.products.
  const configuredId = String(process.env.RECON_PRODUCT_ID || '').trim();
  if (configuredId) {
    const { data, error } = await db.from('products').select('*').eq('id', configuredId).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  // The stable v2 schema identifies the Recon Water product directly from
  // public.products. No secondary inventory configuration table is required.
  const { data: products, error } = await db.from('products').select('*').limit(500);
  if (error) throw error;
  const rows = (products || []).filter(row => row && row.id);
  const bySku = rows.find(row => String(row.sku || '').trim().toUpperCase() === 'BW-30ML');
  if (bySku) return bySku;

  const configuredSlug = String(process.env.RECON_PRODUCT_SLUG || '').trim().toLowerCase();
  const bySlug = configuredSlug
    ? rows.find(row => String(row.slug || '').trim().toLowerCase() === configuredSlug)
    : null;
  if (bySlug) return bySlug;

  const byName = rows.find(row => {
    const name = String(row.name || '').toLowerCase();
    return name.includes('bacteriostatic') && name.includes('water');
  });
  if (byName) return byName;

  throw new Error('Recon Water product was not found. Set RECON_PRODUCT_ID in Netlify to the product UUID used by Lot Inventory.');
}

function packageCode(qty) {
  if (qty === 1) return 'single';
  if (qty === 5) return 'five';
  if (qty === 10) return 'ten';
  if (qty === 25) return 'case';
  return `qty-${qty}`;
}
function packageLabel(variant) {
  const label = String(variant.package_type || '').trim();
  if (label) return label;
  const q = Number(variant.package_quantity || 1);
  return q === 1 ? 'Single vial' : `${q}-vial pack`;
}

async function loadCatalogue(db, includeInactive = false) {
  const product = await findReconProduct(db);
  const batch = await loadBatchState(db, product.id, false);
  const summary = batchSummary(batch.lots);

  let q = db.from('product_packages')
    .select('id,product_id,code,sku,label,vials_per_pack,stock_kind,price_cents,active,max_per_request,updated_at')
    .eq('product_id', product.id)
    .order('vials_per_pack', { ascending: true });
  if (!includeInactive) q = q.eq('active', true).gt('price_cents', 0);
  const { data: packagesRaw, error } = await q;
  if (error) throw error;

  const packages = (packagesRaw || []).map(pack => {
    const packQty = Math.max(1, Number(pack.vials_per_pack || 1));
    const stockKind = String(pack.stock_kind || '').toLowerCase() === 'sealed' ? 'sealed' : 'loose';
    const batchAvailable = stockKind === 'sealed'
      ? summary.sealed_available
      : Math.floor(summary.loose_available / packQty);
    return {
      id: pack.id,
      product_id: pack.product_id,
      code: pack.code || packageCode(packQty),
      sku: pack.sku,
      label: pack.label || (packQty === 1 ? 'Single vial' : `${packQty}-vial pack`),
      vials_per_pack: packQty,
      stock_kind: stockKind,
      price_cents: Number(pack.price_cents || 0),
      active: !!pack.active,
      max_per_request: Number(pack.max_per_request || 100),
      available_packs: batch.enabled ? batchAvailable : null,
      currency: 'CAD',
      fulfillment_policy: null,
      incoming_quantity: 0,
      incoming_eta: null,
    };
  });
  return { product, packages, lots: batch.enabled ? batch.lots : [], batch_inventory: { installed: batch.installed, enabled: batch.enabled, summary } };
}

async function loadVariant(db, id, market = 'domestic') {
  if (market !== 'domestic') return null;
  const key = String(id || '').trim();
  if (!key) return null;
  let query = db.from('product_packages')
    .select('id,product_id,code,sku,label,vials_per_pack,stock_kind,price_cents,active,max_per_request')
    .eq('active', true);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    query = query.eq('id', key);
  } else {
    const normalized = key.toUpperCase();
    const code = key.toLowerCase();
    query = query.or(`code.eq.${code},sku.eq.${normalized}`);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data || !data.price_cents) return null;
  return {
    id: data.id,
    product_id: data.product_id,
    market: 'domestic',
    sku: data.sku,
    package_type: data.label,
    package_quantity: Number(data.vials_per_pack || 1),
    currency: 'CAD',
    price: Number(data.price_cents) / 100,
    active: !!data.active,
    metadata: { stock_kind: data.stock_kind },
    fulfillment_policy: null,
    inventory_pool_variant_id: null,
    max_per_request: Number(data.max_per_request || 100),
    code: data.code,
    stock_kind: data.stock_kind,
    price_cents: Number(data.price_cents),
  };
}

function promoDiscountCents(promo, subtotalCents) {
  const base = Math.max(0, Number(subtotalCents || 0));
  if (promo.discount_type === 'percentage') {
    return Math.min(base, Math.floor(base * Number(promo.discount_value || 0) / 100));
  }
  return Math.min(base, Number(promo.discount_value || 0));
}

async function validatePromo(db, rawCode, subtotal) {
  const code = normalizeCode(rawCode);
  if (!validCode(code)) return null;
  const { data: promo, error } = await db.from('promo_codes').select('*').eq('code', code).eq('active', true).maybeSingle();
  if (error) throw error;
  if (!promo) return null;
  const today = new Date().toISOString().slice(0, 10);
  const subtotalCents = Math.max(0, cents(subtotal));
  if ((promo.starts_on && promo.starts_on > today) ||
      (promo.ends_on && promo.ends_on < today) ||
      (promo.max_uses != null && Number(promo.uses_count || 0) >= Number(promo.max_uses)) ||
      subtotalCents < Number(promo.min_subtotal_cents || 0)) return null;
  const discountCents = promoDiscountCents(promo, subtotalCents);
  if (discountCents <= 0) return null;
  return {
    promo,
    code,
    discount: discountCents / 100,
    discount_cents: discountCents,
    total: (subtotalCents - discountCents) / 100,
    total_cents: subtotalCents - discountCents,
  };
}

async function eligiblePackageAvailability(db, variant) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await db.from('inventory_lots')
    .select('status,expiry_date,loose_on_hand,loose_reserved,sealed_on_hand,sealed_reserved')
    .eq('product_id', variant.product_id);
  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  const lots = data || [];
  const eligible = lots.filter(lot => lot.status === 'available' && lot.expiry_date && lot.expiry_date >= today);
  if (String(variant.stock_kind || variant.metadata?.stock_kind) === 'sealed') {
    return eligible.reduce((sum, lot) => sum + Math.max(0, Number(lot.sealed_on_hand || 0) - Number(lot.sealed_reserved || 0)), 0);
  }
  const q = Math.max(1, Number(variant.package_quantity || 1));
  return eligible.reduce((sum, lot) => sum + Math.floor(Math.max(0, Number(lot.loose_on_hand || 0) - Number(lot.loose_reserved || 0)) / q), 0);
}

async function submitFlatDomesticOrder(db, body, variant, shipping) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('Enter valid customer details.'), { statusCode: 400 });
  }
  const available = await eligiblePackageAvailability(db, variant);
  if (available != null && available < 1) {
    throw Object.assign(new Error('Selected package is unavailable.'), { statusCode: 409 });
  }

  const subtotalCents = Number(variant.price_cents || cents(variant.price));
  const promoCode = normalizeCode(body.promo_code);
  const promo = promoCode ? await validatePromo(db, promoCode, subtotalCents / 100) : null;
  if (promoCode && !promo) {
    throw Object.assign(new Error('Promo code is invalid or unavailable. Review your checkout total.'), { statusCode: 409 });
  }

  let promoClaimed = false;
  if (promo?.promo) {
    const currentUses = Number(promo.promo.uses_count || 0);
    const { data: claimed, error: claimError } = await db.from('promo_codes')
      .update({ uses_count: currentUses + 1, updated_at: new Date().toISOString() })
      .eq('id', promo.promo.id).eq('uses_count', currentUses).select('id').maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) throw Object.assign(new Error('Promo code is invalid or unavailable. Review your checkout total.'), { statusCode: 409 });
    promoClaimed = true;
  }

  let orderId = null;
  try {
    const { data: product, error: productError } = await db.from('products').select('id,name,is_active').eq('id', variant.product_id).maybeSingle();
    if (productError) throw productError;
    if (!product?.is_active) throw Object.assign(new Error('Product is unavailable.'), { statusCode: 409 });

    const shippingRecord = {
      ...shipping,
      shipping_service_code: 'flat-25-cad',
      shipping_service_name: 'Flat rate shipping',
      shipping_provider: 'flat_rate',
      shipping_rate_cents: FLAT_CANADA_RATE_CAD * 100,
    };
    const orderPayload = {
      customer_name: name,
      customer_email: email,
      shipping: shippingRecord,
      notes: String(body.notes || '').slice(0, 1000),
      status: 'pending_review',
      subtotal_cents: subtotalCents,
      market: 'domestic',
      subtotal_currency: 'CAD',
      shipping_cents: FLAT_CANADA_RATE_CAD * 100,
      shipping_currency: 'CAD',
      payment_method: 'etransfer',
      payment_status: 'not_requested',
      promo_code: promo?.code || null,
      promo_discount_cents: promo?.discount_cents || 0,
      promo_discount_currency: promo ? 'CAD' : null,
    };
    const { data: order, error: orderError } = await db.from('orders').insert(orderPayload).select('id,order_number').single();
    if (orderError) throw orderError;
    orderId = order.id;

    const { error: itemError } = await db.from('order_items').insert({
      order_id: order.id,
      product_id: product.id,
      product_name: product.name,
      sku: variant.sku,
      quantity: 1,
      unit_price_cents: subtotalCents,
      package_id: variant.id,
      package_label: variant.package_type,
      vials_per_pack: Number(variant.package_quantity || 1),
      stock_kind: String(variant.stock_kind || variant.metadata?.stock_kind || 'loose'),
    });
    if (itemError) throw itemError;

    return {
      order_id: order.id,
      order_number: order.order_number,
      subtotal_cents: subtotalCents,
      promo_discount_cents: promo?.discount_cents || 0,
      shipping_cents: FLAT_CANADA_RATE_CAD * 100,
      total_cents: Math.max(0, subtotalCents - (promo?.discount_cents || 0)) + FLAT_CANADA_RATE_CAD * 100,
      shipping_mode: 'flat_25',
    };
  } catch (error) {
    if (orderId) {
      await db.from('order_items').delete().eq('order_id', orderId);
      await db.from('orders').delete().eq('id', orderId);
    }
    if (promoClaimed && promo?.promo) {
      const expected = Number(promo.promo.uses_count || 0) + 1;
      await db.from('promo_codes')
        .update({ uses_count: Math.max(0, expected - 1), updated_at: new Date().toISOString() })
        .eq('id', promo.promo.id).eq('uses_count', expected);
    }
    throw error;
  }
}

async function loadReferral(db, rawCode) {
  const code = normalizeCode(rawCode);
  if (!validCode(code)) return null;
  const { data, error } = await db.from('referral_codes').select('*').eq('code', code).eq('active', true).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function validateReferralAttribution(db, rawCode, email) {
  const ref = await loadReferral(db, rawCode);
  if (!ref) return null;
  if (String(ref.referrer_email || '').trim().toLowerCase() === String(email || '').trim().toLowerCase()) return null;
  return ref;
}

async function validateReferralReward(db, rawCode, email, subtotalAfterPromo) {
  const code = normalizeCode(rawCode);
  if (!validCode(code)) return null;
  const { data: reward, error } = await db.from('referral_rewards').select('*').eq('reward_code', code).is('redeemed_order_id', null).maybeSingle();
  if (error) throw error;
  if (!reward) return null;
  const { data: ref, error: refError } = await db.from('referral_codes').select('*').eq('id', reward.referral_id).eq('active', true).maybeSingle();
  if (refError) throw refError;
  if (!ref || String(ref.referrer_email || '').trim().toLowerCase() !== String(email || '').trim().toLowerCase()) return null;
  const discount = Math.round(Math.max(0, Number(subtotalAfterPromo || 0)) * 0.05 * 100) / 100;
  return discount > 0 ? { reward, ref, discount } : null;
}

function validCanadianAddress(shipping) {
  if (!shipping || typeof shipping !== 'object' || Array.isArray(shipping)) return false;
  const region = String(shipping.region || '').trim().toUpperCase();
  const postal = String(shipping.postal || '').trim().toUpperCase();
  const regions = new Set(['AB','BC','MB','NB','NL','NT','NS','NU','ON','PE','QC','SK','YT']);
  return String(shipping.address || '').trim().length >= 5 && String(shipping.city || '').trim().length >= 2 && regions.has(region) && /^[A-CEGHJ-NPRSTVXY]\d[A-CEGHJ-NPRSTV-Z][ ]?\d[A-CEGHJ-NPRSTV-Z]\d$/.test(postal) && String(shipping.country || '').trim().toLowerCase() === 'canada';
}

async function getProfile(db, packageId) {
  let result = await db.from('shipping_profiles').select('*').eq('package_id', packageId).maybeSingle();
  if (!result.error) return result.data || null;
  if (!/column .*package_id|schema cache/i.test(String(result.error?.message || ''))) throw result.error;
  result = await db.from('shipping_profiles').select('*').eq('variant_id', packageId).maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  let db;
  try { db = dbClient(); } catch (e) { return json(503, { error: e.message }); }
  const mode = event.queryStringParameters?.mode || 'catalogue';

  try {
    if (event.httpMethod === 'GET' && mode === 'health') {
      const { error } = await db.from('products').select('id').limit(1);
      return error ? json(503, { connected: false, error: error.message }) : json(200, { connected: true, chitchats: chitChatsConfigured() });
    }

    if (event.httpMethod === 'GET' && mode === 'catalogue') return json(200, await loadCatalogue(db, false));

    if (event.httpMethod === 'GET' && mode === 'shipping-settings') {
      await requireShippingAdmin(event, db);
      return json(200, await getReconShippingMode(db));
    }

    if (event.httpMethod === 'GET' && mode === 'inventory-admin') {
      await requireInventoryAdmin(event, db);
      const product = await findReconProduct(db);
      const batch = await loadBatchState(db, product.id, true);
      const database = supabaseProjectIdentity();
      if (!batch.installed) {
        return json(200, {
          installed: false,
          enabled: false,
          product,
          config: null,
          lots: [],
          movements: [],
          summary: null,
          packages: [],
          packageAvailability: {},
          diagnostics: {
            ...database,
            missing_relation: 'public.inventory_lots',
            installer: 'supabase/003_packaging_and_lots.sql'
          }
        });
      }
      const catalogue = await loadCatalogue(db, true);
      const summary = batchSummary(batch.lots);
      const packageAvailability = Object.fromEntries((catalogue.packages || []).map(p => [p.id, p.available_packs]));
      return json(200, { installed: true, product, enabled: batch.enabled, config: batch.config, lots: batch.lots, movements: batch.movements, summary, packages: catalogue.packages, packageAvailability, diagnostics: database });
    }

    let body = {};
    if (event.httpMethod === 'POST') {
      try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid request data.' }); }
    }


    if (event.httpMethod === 'POST' && mode === 'shipping-settings-save') {
      const admin = await requireShippingAdmin(event, db);
      const requestedMode = String(body.mode || '').trim().toLowerCase();
      if (!['chitchats','flat_25'].includes(requestedMode)) return json(400, { error: 'Invalid shipping mode.' });
      const value = { mode: requestedMode, flat_rate_cad: FLAT_CANADA_RATE_CAD, updated_by: admin.id, updated_at: new Date().toISOString() };
      const { error } = await db.from('app_settings').upsert({ key: 'recon_shipping_mode', value, public_read: false, updated_by: admin.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      return json(200, { mode: requestedMode, flat_rate_cad: FLAT_CANADA_RATE_CAD });
    }

    if (event.httpMethod === 'POST' && mode === 'inventory-receive') {
      const admin = await requireInventoryAdmin(event, db);
      const product = await findReconProduct(db);
      const { data, error } = await db.rpc('service_admin_receive_lot_v2', {
        p_product_id: product.id,
        p_lot_code: String(body.lot_code || ''),
        p_expiry: body.expiry_date || null,
        p_supplier: String(body.supplier_reference || ''),
        p_location: String(body.location || ''),
        p_loose: Number(body.loose_count || 0),
        p_sealed: Number(body.sealed_count || 0),
        p_actor: admin.id,
      });
      if (error) throw error;
      return json(200, { id: data });
    }

    if (event.httpMethod === 'POST' && mode === 'inventory-update-lot') {
      const admin = await requireInventoryAdmin(event, db);
      const { error } = await db.rpc('service_admin_update_lot_v2', {
        p_lot_id: String(body.lot_id || ''), p_lot_code: String(body.lot_code || ''), p_expiry: body.expiry_date || null,
        p_supplier: String(body.supplier_reference || ''), p_location: String(body.location || ''), p_status: String(body.status || ''), p_actor: admin.id,
      });
      if (error) throw error;
      return json(200, { ok: true });
    }

    if (event.httpMethod === 'POST' && mode === 'inventory-adjust-lot') {
      const admin = await requireInventoryAdmin(event, db);
      const { error } = await db.rpc('service_admin_adjust_lot_v2', {
        p_lot_id: String(body.lot_id || ''), p_loose_delta: Number(body.loose_delta || 0), p_sealed_delta: Number(body.sealed_delta || 0),
        p_reason: String(body.reason || ''), p_actor: admin.id,
      });
      if (error) throw error;
      return json(200, { ok: true });
    }

    if (event.httpMethod === 'POST' && mode === 'inventory-open-case') {
      const admin = await requireInventoryAdmin(event, db);
      const { error } = await db.rpc('service_admin_open_case_v2', { p_lot_id: String(body.lot_id || ''), p_actor: admin.id });
      if (error) throw error;
      return json(200, { ok: true });
    }

    if (event.httpMethod === 'POST' && mode === 'inventory-activate') {
      await requireInventoryAdmin(event, db);
      // Compatibility endpoint retained for older admin bundles. The v2 ledger is
      // authoritative as soon as inventory_lots exists, so no activation is needed.
      return json(200, { ok: true, already_authoritative: true });
    }

    if (event.httpMethod === 'POST' && mode === 'promo-validate') {
      const variant = await loadVariant(db, String(body.package_id || ''));
      if (!variant) return json(400, { error: 'Promo code could not be applied.' });
      const promo = await validatePromo(db, body.code, Number(variant.price));
      if (!promo) return json(400, { error: 'Promo code is invalid or unavailable.' });
      return json(200, { code: promo.code, discount_cents: cents(promo.discount), subtotal_cents: cents(variant.price), final_subtotal_cents: cents(promo.total) });
    }

    if (event.httpMethod === 'POST' && mode === 'referral-validate') {
      const purpose = String(body.purpose || 'attribution');
      if (purpose === 'attribution') {
        const ref = await validateReferralAttribution(db, body.code, body.email);
        if (!ref) return json(400, { error: 'Referral code is invalid or unavailable.' });
        return json(200, { code: ref.code, valid: true });
      }
      const variant = await loadVariant(db, String(body.package_id || ''));
      if (!variant) return json(400, { error: 'Referral reward could not be applied.' });
      let eligible = Number(variant.price);
      if (body.promo_code) {
        const promo = await validatePromo(db, body.promo_code, eligible);
        if (!promo) return json(409, { error: 'Your promo code is no longer available. Review your checkout total.' });
        eligible = promo.total;
      }
      const reward = await validateReferralReward(db, body.code, body.email, eligible);
      if (!reward) return json(400, { error: 'Referral reward is invalid, already used, or does not belong to this email.' });
      return json(200, { code: normalizeCode(body.code), discount_cents: cents(reward.discount), final_subtotal_cents: cents(Math.max(0, eligible - reward.discount)) });
    }

    if (event.httpMethod === 'POST' && mode === 'shipping-quote') {
      if (String(body.market || 'domestic') !== 'domestic') return json(400, { error: 'Automated shipping is available only for Canadian Recon Water orders.' });
      const variant = await loadVariant(db, String(body.package_id || ''));
      if (!variant || String(variant.currency || '').trim().toUpperCase() !== 'CAD') return json(400, { error: 'Selected package is unavailable.' });
      const shipping = body.shipping && typeof body.shipping === 'object' ? { ...body.shipping, country: 'Canada' } : null;
      if (!validCanadianAddress(shipping)) return json(400, { error: 'Complete a valid Canadian delivery address to calculate shipping.' });
      const shippingMode = await getReconShippingMode(db);
      if (shippingMode.mode === 'flat_25') {
        const flatRate = {
          service_code: 'flat-25-cad',
          service_name: 'Flat rate shipping',
          amount_cents: FLAT_CANADA_RATE_CAD * 100,
          estimate: null,
          tracking: null,
          provider: 'flat_rate',
          quote_id: `flat-25-cad:${variant.id}`,
        };
        return json(200, { configured: true, mode: 'flat_25', environment: 'flat-rate', rates: [flatRate] });
      }

      const items = [{ variant_id: variant.id, quantity: 1 }];
      if (!chitChatsConfigured()) return json(503, { error: 'Chit Chats is not configured in Netlify yet. An administrator can enable the $25 CAD emergency flat rate from Admin → Shipping.' });
      const profile = await getProfile(db, variant.id);
      if (!profile?.active) return json(409, { error: 'Live shipping is not configured for this package yet. An administrator can enable the $25 CAD emergency flat rate from Admin → Shipping.' });
      const recipient = { ...shipping, name: String(body.name || '').trim(), email: String(body.email || '').trim() };
      const rawRates = await getChitChatsRates({ profile, recipient, valueCents: cents(variant.price), sku: variant.sku });
      const rates = [];
      for (const rate of rawRates) {
        const { data: quoteId, error } = await db.rpc('recon_store_shipping_quote', {
          p_shipping_address: shipping,
          p_market: 'domestic',
          p_items: items,
          p_service_code: rate.service_code,
          p_service_name: rate.service_name,
          p_amount: Number(rate.amount_cents) / 100,
          p_currency: 'CAD',
          p_estimate: rate.estimate || null,
          p_provider_payload: rate,
          p_ttl_minutes: 15,
        });
        if (error) throw error;
        rates.push({ ...rate, provider: 'chitchats', quote_id: quoteId });
      }
      return json(200, { configured: true, mode: 'chitchats', environment: chitChatsEnvironment(), rates });
    }

    if (event.httpMethod === 'POST' && mode === 'submit-domestic') {
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim();
      const variant = await loadVariant(db, String(body.package_id || ''));
      if (!variant) return json(409, { error: 'Selected package is unavailable.' });
      if (name.length < 2 || !email.includes('@')) return json(400, { error: 'Enter valid customer details.' });
      const shipping = body.shipping && typeof body.shipping === 'object' ? { ...body.shipping, country: 'Canada' } : null;
      if (!validCanadianAddress(shipping)) return json(400, { error: 'A complete Canadian delivery address is required.' });

      const shippingMode = await getReconShippingMode(db);
      if (shippingMode.mode === 'flat_25') {
        const result = await submitFlatDomesticOrder(db, body, variant, shipping);
        return json(200, result);
      }

      const quoteId = String(body.shipping_quote_id || '').trim();
      const expectedShippingCents = Number(body.expected_shipping_cents);
      if (!quoteId || !Number.isInteger(expectedShippingCents) || expectedShippingCents <= 0) return json(409, { error: 'Choose a current shipping service before submitting.' });
      const idempotency = body.idempotency_key || crypto.randomUUID();
      const address = { ...shipping, shipping_quote_id: quoteId };
      const items = [{ variant_id: variant.id, quantity: 1 }];
      const { data, error } = await db.rpc('recon_create_order_v1', {
        p_idempotency_key: idempotency,
        p_customer_name: name,
        p_customer_email: email,
        p_shipping_address: address,
        p_market: 'domestic',
        p_currency: 'CAD',
        p_shipping_total: expectedShippingCents / 100,
        p_items: items,
        p_payment_method: 'etransfer',
        p_promo_code: body.promo_code || null,
        p_referral_code: null,
        p_referral_reward_code: null,
      });
      if (error) {
        const code = String(error.message || '');
        if (/SHIPPING_QUOTE_REQUIRED|SHIPPING_QUOTE_EXPIRED|SHIPPING_CHANGED/.test(code)) return json(409, { error: 'The shipping quote changed or expired. Recalculate shipping and review the total.' });
        throw error;
      }
      return json(200, data || {});
    }

    if (event.httpMethod === 'POST' && mode === 'submit-international') {
      return json(409, { error: 'International automated shipping is temporarily unavailable while a compatible cross-border carrier is configured. No flat-rate shipping is being charged.' });
    }

    return json(404, { error: 'Endpoint not found.' });
  } catch (error) {
    console.error('Recon API error:', error);
    return json(Number(error?.statusCode) || 500, { error: error?.message || 'Unexpected server error.' });
  }
}
