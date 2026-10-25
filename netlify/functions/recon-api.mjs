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
  // PGRST205/42P01 are relation errors. Do NOT treat generic "schema cache"
  // or PGRST204 as a missing table: PGRST204 is a missing-column error.
  return code === '42P01' || code === 'PGRST205' || /could not find the table|relation [^ ]+ does not exist/i.test(message);
}

function isMissingFunction(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === '42883' || code === 'PGRST202' || /function .* does not exist|could not find the function/i.test(message);
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
  const { data: config, error: configError } = await db.from('recon_inventory_config').select('*').eq('product_id', productId).maybeSingle();
  if (configError) {
    if (isMissingRelation(configError)) return { installed: false, enabled: false, lots: [], movements: [] };
    throw configError;
  }
  const { data: lots, error: lotsError } = await db.from('recon_inventory_lots')
    .select('*').eq('product_id', productId).order('expiry_date', { ascending: true }).order('created_at', { ascending: true });
  if (lotsError) throw lotsError;
  let movements = [];
  if (includeMovements) {
    const { data, error } = await db.from('recon_inventory_lot_movements')
      .select('*').eq('product_id', productId).order('created_at', { ascending: false }).limit(120);
    if (error) throw error;
    movements = data || [];
  }
  return { installed: true, enabled: !!config?.enabled, config: config || null, lots: lots || [], movements };
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

async function fetchProductById(db, productId) {
  if (!productId) return null;
  const { data, error } = await db.from('products').select('*').eq('id', productId).maybeSingle();
  if (error) throw error;
  return data || null;
}

function chooseReconProductId(variants = []) {
  const known = new Set(['RW-BAC-01','RW-BAC-05','RW-BAC-10','RW-BAC-25']);
  const groups = new Map();
  for (const row of variants || []) {
    const productId = String(row?.product_id || '').trim();
    if (!productId) continue;
    const sku = String(row?.sku || '').trim().toUpperCase();
    const qty = Number(row?.package_quantity || 0);
    const entry = groups.get(productId) || { productId, skus:new Set(), quantities:new Set(), active:0 };
    if (sku) entry.skus.add(sku);
    if (qty > 0) entry.quantities.add(qty);
    if (row?.active) entry.active += 1;
    groups.set(productId, entry);
  }
  const scored = [...groups.values()].map(entry => {
    const exact = [...entry.skus].filter(sku => known.has(sku)).length;
    const reconSku = [...entry.skus].filter(sku => sku.startsWith('RW-BAC-')).length;
    const q = entry.quantities;
    const structure = (q.has(1)?4:0)+(q.has(5)?2:0)+(q.has(10)?2:0)+(q.has(25)?4:0);
    return { ...entry, score:(exact*20)+(reconSku*5)+structure+Math.min(entry.active,4) };
  }).sort((a,b)=>b.score-a.score || b.skus.size-a.skus.size || a.productId.localeCompare(b.productId));
  if (!scored.length || scored[0].score <= 0) return null;
  return scored[0].productId;
}

async function bindReconInventoryProduct(db, productId) {
  if (!productId) return;
  const { error } = await db.rpc('recon_bind_inventory_product', { p_product_id: productId });
  if (error && !isMissingFunction(error) && !isMissingRelation(error)) throw error;
}

async function findReconProduct(db) {
  // 1) Explicit deployment configuration always wins.
  const configuredId = String(process.env.RECON_PRODUCT_ID || '').trim();
  if (configuredId) {
    const product = await fetchProductById(db, configuredId);
    if (product) { await bindReconInventoryProduct(db, product.id); return product; }
  }

  // 2) Existing batch config is authoritative when already bound.
  const { data: inventoryConfigs, error: configError } = await db
    .from('recon_inventory_config')
    .select('product_id,enabled,updated_at')
    .not('product_id','is',null)
    .order('enabled',{ascending:false})
    .order('updated_at',{ascending:false})
    .limit(10);
  if (!configError && inventoryConfigs?.length) {
    for (const row of inventoryConfigs) {
      const product = await fetchProductById(db, row.product_id);
      if (product) { await bindReconInventoryProduct(db, product.id); return product; }
    }
  } else if (configError && !isMissingRelation(configError) && String(configError?.code || '') !== 'PGRST204') {
    throw configError;
  }

  // 3) Resolve from the exact live storefront SKU family. This is the stable
  // identifier in this project; product names/slugs are not used for binding.
  const knownSkus = ['RW-BAC-01','RW-BAC-05','RW-BAC-10','RW-BAC-25'];
  const { data: exactVariants, error: exactError } = await db.from('product_variants')
    .select('product_id,sku,package_quantity,active')
    .eq('market','domestic')
    .in('sku',knownSkus)
    .limit(100);
  if (exactError) throw exactError;
  let productId = chooseReconProductId(exactVariants || []);

  // 4) Compatibility fallback for a renamed RW-BAC SKU while retaining the
  // package structure used by this storefront.
  if (!productId) {
    const { data: domesticVariants, error: variantError } = await db.from('product_variants')
      .select('product_id,sku,package_quantity,active')
      .eq('market','domestic')
      .limit(1000);
    if (variantError) throw variantError;
    productId = chooseReconProductId(domesticVariants || []);
  }

  if (productId) {
    const product = await fetchProductById(db, productId);
    if (product) { await bindReconInventoryProduct(db, product.id); return product; }
  }

  // 5) Last-resort human-readable lookup. This is never the primary binding.
  const { data: products, error } = await db.from('products').select('*').limit(500);
  if (error) throw error;
  const byName = (products || []).find(row => {
    const name = String(row?.name || '').toLowerCase();
    return name.includes('bacteriostatic') && name.includes('water');
  });
  if (byName) { await bindReconInventoryProduct(db, byName.id); return byName; }

  throw new Error('Recon Water product could not be resolved from the live RW-BAC variants.');
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
  let q = db.from('product_variants')
    .select('id,product_id,market,sku,strength,package_type,package_quantity,currency,price,active,metadata,fulfillment_policy,inventory_pool_variant_id,updated_at')
    .eq('product_id', product.id)
    .eq('market', 'domestic')
    .order('package_quantity', { ascending: true });
  if (!includeInactive) q = q.eq('active', true).gt('price', 0);
  const { data: variants, error } = await q;
  if (error) throw error;
  const ids = [...new Set((variants || []).flatMap(v => [v.id, v.inventory_pool_variant_id]).filter(Boolean))];
  const { data: inventory, error: invError } = ids.length
    ? await db.from('inventory').select('variant_id,on_hand,reserved,incoming_quantity,incoming_eta,inventory_note,updated_at').in('variant_id', ids)
    : { data: [], error: null };
  if (invError) throw invError;
  const inv = new Map((inventory || []).map(row => [row.variant_id, row]));
  const packages = (variants || []).map(v => {
    const sourceId = v.inventory_pool_variant_id || v.id;
    const row = inv.get(sourceId);
    const free = row ? Math.max(0, Number(row.on_hand || 0) - Number(row.reserved || 0)) : 0;
    const packQty = Math.max(1, Number(v.package_quantity || 1));
    const stockKind = String(v.metadata?.stock_kind || '').toLowerCase() === 'sealed' || /case/i.test(String(v.package_type || '')) ? 'sealed' : 'loose';
    const sharedPool = !!v.inventory_pool_variant_id && v.inventory_pool_variant_id !== v.id;
    const batchAvailable = stockKind === 'sealed' ? summary.sealed_available : Math.floor(summary.loose_available / packQty);
    const legacyAvailable = v.fulfillment_policy === 'unlimited' ? 999999 : sharedPool ? Math.floor(free / packQty) : free;
    return {
      id: v.id,
      product_id: v.product_id,
      code: packageCode(packQty),
      sku: v.sku,
      label: packageLabel(v),
      vials_per_pack: packQty,
      stock_kind: stockKind,
      price_cents: cents(v.price),
      active: !!v.active,
      max_per_request: 100,
      available_packs: batch.enabled ? batchAvailable : legacyAvailable,
      currency: String(v.currency || 'CAD').trim(),
      fulfillment_policy: v.fulfillment_policy,
      incoming_quantity: Number(row?.incoming_quantity || 0),
      incoming_eta: row?.incoming_eta || null,
    };
  });
  return { product, packages, lots: batch.enabled ? batch.lots : [], batch_inventory: { installed: batch.installed, enabled: batch.enabled, summary } };
}

async function loadVariant(db, id, market = 'domestic') {
  const { data, error } = await db.from('product_variants')
    .select('id,product_id,market,sku,package_type,package_quantity,currency,price,active,metadata,fulfillment_policy,inventory_pool_variant_id')
    .eq('id', id).eq('market', market).eq('active', true).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function validatePromo(db, rawCode, subtotal) {
  const code = normalizeCode(rawCode);
  if (!validCode(code)) return null;
  const { data, error } = await db.rpc('validate_promo_code', { p_code: code, p_market: 'domestic', p_subtotal: Number(subtotal) });
  if (error) throw error;
  if (!data || !data.valid) return null;
  return {
    code: String(data.code || code).toUpperCase(),
    discount: Number(data.discount || 0),
    total: Number(data.total ?? (Number(subtotal) - Number(data.discount || 0))),
  };
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

async function getProfile(db, variantId) {
  const { data, error } = await db.from('shipping_profiles').select('*').eq('variant_id', variantId).maybeSingle();
  if (error) throw error;
  return data || null;
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
            missing_relation: 'public.recon_inventory_config',
            installer: 'supabase/013_repair_batch_inventory_schema.sql'
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
      const { error: expireError } = await db.from('shipping_quotes').update({ expires_at: new Date().toISOString() }).is('consumed_at', null).gt('expires_at', new Date().toISOString());
      if (expireError) throw expireError;
      return json(200, { mode: requestedMode, flat_rate_cad: FLAT_CANADA_RATE_CAD });
    }

    if (event.httpMethod === 'POST' && mode === 'inventory-receive') {
      const admin = await requireInventoryAdmin(event, db);
      const product = await findReconProduct(db);
      const { data, error } = await db.rpc('recon_receive_inventory_lot', {
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
      const { error } = await db.rpc('recon_update_inventory_lot', {
        p_lot_id: String(body.lot_id || ''), p_lot_code: String(body.lot_code || ''), p_expiry: body.expiry_date || null,
        p_supplier: String(body.supplier_reference || ''), p_location: String(body.location || ''), p_status: String(body.status || ''), p_actor: admin.id,
      });
      if (error) throw error;
      return json(200, { ok: true });
    }

    if (event.httpMethod === 'POST' && mode === 'inventory-adjust-lot') {
      const admin = await requireInventoryAdmin(event, db);
      const { error } = await db.rpc('recon_adjust_inventory_lot', {
        p_lot_id: String(body.lot_id || ''), p_loose_delta: Number(body.loose_delta || 0), p_sealed_delta: Number(body.sealed_delta || 0),
        p_reason: String(body.reason || ''), p_actor: admin.id,
      });
      if (error) throw error;
      return json(200, { ok: true });
    }

    if (event.httpMethod === 'POST' && mode === 'inventory-open-case') {
      const admin = await requireInventoryAdmin(event, db);
      const { error } = await db.rpc('recon_open_inventory_case', { p_lot_id: String(body.lot_id || ''), p_actor: admin.id });
      if (error) throw error;
      return json(200, { ok: true });
    }

    if (event.httpMethod === 'POST' && mode === 'inventory-activate') {
      const admin = await requireInventoryAdmin(event, db);
      const product = await findReconProduct(db);
      const { data, error } = await db.rpc('recon_activate_batch_inventory', { p_product_id: product.id, p_actor: admin.id });
      if (error) throw error;
      return json(200, { ok: true, inventory: data });
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
      const items = [{ variant_id: variant.id, quantity: 1 }];

      if (shippingMode.mode === 'flat_25') {
        const flatRate = {
          service_code: 'flat-25-cad',
          service_name: 'Flat rate shipping',
          amount_cents: FLAT_CANADA_RATE_CAD * 100,
          estimate: null,
          tracking: null,
          provider: 'flat_rate',
        };
        const { data: quoteId, error } = await db.rpc('recon_store_shipping_quote', {
          p_shipping_address: shipping,
          p_market: 'domestic',
          p_items: items,
          p_service_code: flatRate.service_code,
          p_service_name: flatRate.service_name,
          p_amount: FLAT_CANADA_RATE_CAD,
          p_currency: 'CAD',
          p_estimate: null,
          p_provider_payload: { ...flatRate, admin_fallback: true },
          p_ttl_minutes: 60,
        });
        if (error) throw error;
        const { error: providerError } = await db.from('shipping_quotes').update({ provider: 'flat_rate' }).eq('id', quoteId);
        if (providerError) throw providerError;
        return json(200, { configured: true, mode: 'flat_25', environment: 'flat-rate', rates: [{ ...flatRate, quote_id: quoteId }] });
      }

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
      const reconProduct = await findReconProduct(db);
      const batch = await loadBatchState(db, reconProduct.id, false);
      if (batch.enabled) {
        const { error: syncError } = await db.rpc('recon_sync_variant_inventory', { p_product_id: reconProduct.id });
        if (syncError) throw syncError;
      }
      const variant = await loadVariant(db, String(body.package_id || ''));
      if (!variant) return json(409, { error: 'Selected package is unavailable.' });
      if (name.length < 2 || !email.includes('@')) return json(400, { error: 'Enter valid customer details.' });
      const shipping = body.shipping && typeof body.shipping === 'object' ? { ...body.shipping, country: 'Canada' } : null;
      if (!validCanadianAddress(shipping)) return json(400, { error: 'A complete Canadian delivery address is required.' });
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
        p_referral_code: body.referral_code || null,
        p_referral_reward_code: body.referral_reward_code || null,
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
