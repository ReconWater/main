import { createClient } from '@supabase/supabase-js';
import { chitChatsConfigured, getChitChatsRates } from './_chitchats.mjs';

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

const normalizeReferralCode = value => String(value || '').trim().toUpperCase();
const referralCodeValid = code => /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code);
async function loadReferral(db, rawCode) {
  const code = normalizeReferralCode(rawCode);
  if (!referralCodeValid(code)) return null;
  const { data, error } = await db.from('referral_codes').select('*').eq('code', code).eq('active', true).maybeSingle();
  if (error) throw error;
  return data || null;
}
async function validateReferralAttribution(db, rawCode, customerEmail = '') {
  const referral = await loadReferral(db, rawCode);
  if (!referral) return null;
  const email = String(customerEmail || '').trim().toLowerCase();
  if (email && email === String(referral.referrer_email || '').trim().toLowerCase()) return null;
  return referral;
}
async function validateReferralReward(db, rawCode, customerEmail, eligibleSubtotalCents) {
  const code = normalizeReferralCode(rawCode);
  if (!referralCodeValid(code)) return null;
  const { data: reward, error } = await db.from('referral_rewards').select('*')
    .eq('reward_code', code).is('redeemed_order_id', null).maybeSingle();
  if (error) throw error;
  if (!reward) return null;
  const { data: referral, error: referralError } = await db.from('referral_codes').select('*')
    .eq('id', reward.referral_id).eq('active', true).maybeSingle();
  if (referralError) throw referralError;
  if (!referral) return null;
  const email = String(customerEmail || '').trim().toLowerCase();
  if (email && email !== String(referral.referrer_email || '').trim().toLowerCase()) return null;
  const base = Math.max(0, Number(eligibleSubtotalCents || 0));
  const discount = Math.min(base, Math.floor(base * 0.05));
  if (discount <= 0) return null;
  return { referral, reward, discount, final: Math.max(0, base - discount) };
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


async function loadShippingProfile(db, packageId) {
  const { data, error } = await db.from('shipping_profiles').select('*').eq('package_id', packageId).eq('active', true).maybeSingle();
  if (error) {
    if (error.code === '42P01' || error.code === '42703') return null;
    throw error;
  }
  return data || null;
}

async function shippingQuote(db, { market, packageId, recipient, valueCents, sku }) {
  const domesticFallback = { live: false, amount_cents: 0, currency: 'CAD', service_code: null, service_name: 'Delivery confirmed after review', estimate: '', cad_amount_cents: null };
  const internationalFallback = { live: false, amount_cents: 3000, currency: 'USD', service_code: 'flat_rate_fallback', service_name: 'Flat delivery', estimate: '', cad_amount_cents: null };
  // Chit Chats currently prohibits medicine/DIN goods from cross-border and international shipment.
  // Recon Water therefore uses Chit Chats live rating only for Canadian orders.
  if (market !== 'domestic') return { configured: false, profile_ready: false, rates: [], fallback: internationalFallback };
  if (!chitChatsConfigured()) return { configured: false, profile_ready: false, rates: [], fallback: domesticFallback };
  const profile = await loadShippingProfile(db, packageId);
  if (!profile) return { configured: true, profile_ready: false, rates: [], fallback: domesticFallback };
  try {
    const rates = await getChitChatsRates({ profile, recipient, valueCents, sku });
    return { configured: true, profile_ready: true, rates, fallback: domesticFallback };
  } catch (error) {
    return { configured: true, profile_ready: true, rates: [], fallback: domesticFallback, live_error: String(error?.message || 'Live Chit Chats rates are temporarily unavailable') };
  }
}

function selectedShippingRate(quote, serviceCode, expectedCents) {
  if (!quote?.rates?.length) return quote?.fallback || null;
  const selected = quote.rates.find(rate => rate.service_code === String(serviceCode || ''));
  if (!selected) throw new Error('Select an available shipping service');
  if (Number.isInteger(Number(expectedCents)) && Number(expectedCents) !== Number(selected.amount_cents)) {
    throw new Error('Shipping rate changed. Review the updated delivery price before submitting');
  }
  return { ...selected, live: true };
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


    if (event.httpMethod === 'POST' && mode === 'shipping-quote') {
      let body;
      try { body = JSON.parse(event.body || '{}'); }
      catch { return json(400, { error: 'Invalid request data.' }); }
      const market = body.market === 'international' ? 'international' : 'domestic';
      const recipient = body.shipping && typeof body.shipping === 'object' ? { ...body.shipping, name: body.name, email: body.email } : null;
      if (!recipient || String(recipient.name || '').trim().length < 2 || String(recipient.address || '').trim().length < 5 || String(recipient.city || '').trim().length < 2 || String(recipient.postal || '').trim().length < 2) {
        return json(400, { error: 'Complete the delivery address to calculate shipping.' });
      }
      if (market === 'domestic') {
        const packageId = String(body.package_id || '');
        const { data: pack, error } = await db.from('product_packages').select('id,sku,price_cents,active').eq('id', packageId).eq('active', true).maybeSingle();
        if (error) throw error;
        if (!pack || pack.price_cents == null) return json(409, { error: 'Selected package is unavailable.' });
        const quote = await shippingQuote(db, { market, packageId, recipient: { ...recipient, country: 'Canada' }, valueCents: Number(pack.price_cents), sku: pack.sku });
        return json(200, quote);
      }
      const quantity = Number(body.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5) return json(400, { error: 'International orders are limited to 1–5 vials.' });
      return json(200, { configured: false, profile_ready: false, rates: [], fallback: { live: false, amount_cents: 3000, currency: 'USD', service_code: 'flat_rate_fallback', service_name: 'Flat delivery', estimate: '', cad_amount_cents: null } });
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

    if (event.httpMethod === 'POST' && mode === 'referral-validate') {
      let body;
      try { body = JSON.parse(event.body || '{}'); }
      catch { return json(400, { error: 'Invalid request data.' }); }
      const purpose = String(body.purpose || 'attribution');
      const code = normalizeReferralCode(body.code);
      if (!referralCodeValid(code)) return json(400, { error: 'Referral code is invalid or unavailable.' });
      if (purpose === 'attribution') {
        const referral = await validateReferralAttribution(db, code, body.email || '');
        if (!referral) return json(400, { error: 'Referral code is invalid or unavailable.' });
        return json(200, { code: referral.code, valid: true });
      }
      if (purpose !== 'reward') return json(400, { error: 'Invalid referral request.' });
      const packageId = String(body.package_id || '');
      const { data: pack, error: packError } = await db.from('product_packages').select('id,price_cents,active').eq('id', packageId).eq('active', true).maybeSingle();
      if (packError) throw packError;
      if (!pack || pack.price_cents == null) return json(400, { error: 'Referral reward could not be applied.' });
      const subtotal = Number(pack.price_cents);
      const promoCode = normalizePromoCode(body.promo_code);
      const promoResult = promoCode ? await validateDomesticPromo(db, promoCode, subtotal) : null;
      if (promoCode && !promoResult) return json(409, { error: 'Promo code changed. Review your total before applying the referral reward.' });
      const afterPromo = promoResult ? promoResult.final : subtotal;
      const reward = await validateReferralReward(db, code, body.email || '', afterPromo);
      if (!reward) return json(400, { error: 'Referral reward is invalid, already used, or unavailable.' });
      return json(200, { code: reward.reward.reward_code, discount_cents: reward.discount, eligible_subtotal_cents: afterPromo, final_subtotal_cents: reward.final, rate: 5 });
    }

    if (event.httpMethod === 'POST' && mode === 'submit-domestic') {
      let body;
      try { body = JSON.parse(event.body || '{}'); }
      catch { return json(400, { error: 'Invalid request data.' }); }

      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim();
      const notes = String(body.notes || '');
      const packageId = String(body.package_id || '');
      const promoCode = normalizePromoCode(body.promo_code);
      const referralCode = normalizeReferralCode(body.referral_code);
      const referralRewardCode = normalizeReferralCode(body.referral_reward_code);
      const shipping = body.shipping && typeof body.shipping === 'object' && !Array.isArray(body.shipping) ? body.shipping : null;
      const shippingServiceCode = String(body.shipping_service_code || '');
      const expectedShippingCents = body.expected_shipping_cents == null ? null : Number(body.expected_shipping_cents);
      if (name.length < 2 || name.length > 100 || email.length < 5 || email.length > 200 || !email.includes('@') || notes.length > 1000 || !packageId) {
        return json(400, { error: 'Invalid customer details.' });
      }
      if (!shipping) return json(400, { error: 'A complete Canadian delivery address is required.' });
      const address = String(shipping.address || '').trim();
      const city = String(shipping.city || '').trim();
      const region = String(shipping.region || '').trim().toUpperCase();
      const postal = String(shipping.postal || '').trim().toUpperCase();
      const country = String(shipping.country || '').trim();
      const regions = new Set(['AB','BC','MB','NB','NL','NT','NS','NU','ON','PE','QC','SK','YT']);
      if (address.length < 5 || city.length < 2 || !regions.has(region) || !/^[A-CEGHJ-NPRSTVXY]\d[A-CEGHJ-NPRSTV-Z][ ]?\d[A-CEGHJ-NPRSTV-Z]\d$/.test(postal) || country.toLowerCase() !== 'canada' || JSON.stringify(shipping).length > 1200) {
        return json(400, { error: 'A valid Canadian delivery address is required.' });
      }

      const recentCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count: recentCount, error: recentError } = await db.from('orders').select('id', { count: 'exact', head: true }).eq('market', 'domestic').ilike('customer_email', email).gt('created_at', recentCutoff);
      if (recentError) throw recentError;
      if (Number(recentCount || 0) >= 3) return json(429, { error: 'Too many recent requests.' });

      const { data: pack, error: packError } = await db.from('product_packages').select('id,product_id,code,sku,label,vials_per_pack,stock_kind,price_cents,active,max_per_request').eq('id', packageId).eq('active', true).maybeSingle();
      if (packError) throw packError;
      if (!pack || pack.price_cents == null) return json(409, { error: 'Selected package is unavailable.' });
      const { data: product, error: productError } = await db.from('products').select('id,name,is_active').eq('id', pack.product_id).eq('is_active', true).maybeSingle();
      if (productError) throw productError;
      if (!product) return json(409, { error: 'Product unavailable.' });
      const { data: lots, error: lotsError } = await db.from('inventory_lots').select('id,product_id,expiry_date,status,loose_on_hand,loose_reserved,sealed_on_hand,sealed_reserved').eq('product_id', product.id);
      if (lotsError) throw lotsError;
      if (packageAvailability(pack, lots || []) < 1) return json(409, { error: 'Insufficient inventory for selected package.' });

      const subtotalCents = Number(pack.price_cents);
      const promoResult = promoCode ? await validateDomesticPromo(db, promoCode, subtotalCents) : null;
      if (promoCode && !promoResult) return json(409, { error: 'Promo code is invalid or unavailable. Review your total before submitting.' });
      const referral = referralCode ? await validateReferralAttribution(db, referralCode, email) : null;
      if (referralCode && !referral) return json(409, { error: 'Referral code is invalid or cannot be used for this order.' });
      const afterPromoCents = promoResult ? promoResult.final : subtotalCents;
      const referralReward = referralRewardCode ? await validateReferralReward(db, referralRewardCode, email, afterPromoCents) : null;
      if (referralRewardCode && !referralReward) return json(409, { error: 'Referral reward is invalid, already used, or does not belong to this email. Review your total before submitting.' });
      const shippingQuoteResult = await shippingQuote(db, {
        market: 'domestic', packageId: pack.id,
        recipient: { name, email, address, city, region, postal, country: 'Canada' },
        valueCents: subtotalCents, sku: pack.sku,
      });
      const chosenShipping = selectedShippingRate(shippingQuoteResult, shippingServiceCode, expectedShippingCents);
      let promoClaimed = false;
      let rewardClaimed = false;
      if (promoResult) {
        const currentUses = Number(promoResult.promo.uses_count || 0);
        const { data: claimed, error: claimError } = await db.from('promo_codes').update({ uses_count: currentUses + 1, updated_at: new Date().toISOString() }).eq('id', promoResult.promo.id).eq('uses_count', currentUses).select('id').maybeSingle();
        if (claimError) throw claimError;
        if (!claimed) return json(409, { error: 'Promo code is invalid or unavailable.' });
        promoClaimed = true;
      }

      let order = null;
      try {
        const insert = {
          customer_name: name,
          customer_email: email,
          shipping: { address, city, region, postal, country: 'Canada' },
          notes,
          status: 'pending_review',
          subtotal_cents: subtotalCents,
          market: 'domestic',
          subtotal_currency: 'CAD',
          shipping_cents: Number(chosenShipping?.amount_cents || 0),
          shipping_currency: 'CAD',
          shipping_provider: chosenShipping?.live ? 'chitchats' : 'manual',
          shipping_service_code: chosenShipping?.service_code || null,
          shipping_service_name: chosenShipping?.service_name || null,
          shipping_quote_cad_cents: chosenShipping?.cad_amount_cents ?? (chosenShipping?.live ? Number(chosenShipping?.amount_cents || 0) : null),
          shipping_estimate: chosenShipping?.estimate || null,
          shipping_quote_at: chosenShipping?.live ? new Date().toISOString() : null,
          payment_method: 'etransfer',
          payment_status: 'not_requested',
        };
        if (promoResult) {
          insert.promo_code = promoResult.promo.code;
          insert.promo_discount_cents = promoResult.discount;
          insert.promo_discount_currency = 'CAD';
        }
        if (referral) {
          insert.referral_id = referral.id;
          insert.referral_code = referral.code;
        }
        if (referralReward) {
          insert.referral_reward_referral_id = referralReward.referral.id;
          insert.referral_reward_code = referralReward.reward.reward_code;
          insert.referral_reward_discount_cents = referralReward.discount;
          insert.referral_reward_currency = 'CAD';
        }
        const { data: created, error: orderError } = await db.from('orders').insert(insert).select('id,order_number').single();
        if (orderError) throw orderError;
        order = created;
        if (referralReward) {
          const { data: claimedReward, error: rewardError } = await db.from('referral_rewards')
            .update({ redeemed_order_id: order.id, redeemed_at: new Date().toISOString() })
            .eq('id', referralReward.reward.id).is('redeemed_order_id', null).select('id').maybeSingle();
          if (rewardError) throw rewardError;
          if (!claimedReward) throw new Error('Referral reward is no longer available. Review your total before submitting.');
          rewardClaimed = true;
        }
        const { error: itemError } = await db.from('order_items').insert({ order_id: order.id, product_id: product.id, product_name: product.name, sku: pack.sku, quantity: 1, unit_price_cents: subtotalCents, package_id: pack.id, package_label: pack.label, vials_per_pack: pack.vials_per_pack, stock_kind: pack.stock_kind });
        if (itemError) throw itemError;
      } catch (error) {
        if (rewardClaimed && referralReward && order?.id) {
          await db.from('referral_rewards').update({ redeemed_order_id: null, redeemed_at: null })
            .eq('id', referralReward.reward.id).eq('redeemed_order_id', order.id);
        }
        if (order?.id) { await db.from('order_items').delete().eq('order_id', order.id); await db.from('orders').delete().eq('id', order.id); }
        if (promoClaimed && promoResult) {
          const expected = Number(promoResult.promo.uses_count || 0) + 1;
          await db.from('promo_codes').update({ uses_count: Math.max(0, expected - 1), updated_at: new Date().toISOString() }).eq('id', promoResult.promo.id).eq('uses_count', expected);
        }
        throw error;
      }
      return json(200, {
        order_id: order.id,
        order_number: order.order_number || null,
        promo: promoResult ? { code: promoResult.promo.code, discount_cents: promoResult.discount, final_subtotal_cents: promoResult.final } : null,
        referral_reward: referralReward ? { code: referralReward.reward.reward_code, discount_cents: referralReward.discount, final_subtotal_cents: referralReward.final } : null,
        shipping: chosenShipping,
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
      const referralCode = normalizeReferralCode(body.referral_code);
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

      const referral = referralCode ? await validateReferralAttribution(db, referralCode, email) : null;
      if (referralCode && !referral) return json(409, { error: 'Referral code is invalid or cannot be used for this order.' });

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

      // International product pricing stays fixed. Chit Chats is not used for this product cross-border.
      const unitPriceCents = 2000; // USD $20.00 per vial
      const shippingCents = 3000; // Existing international fallback rate.

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
          shipping_provider: 'flat_rate',
          shipping_service_code: 'flat_rate_fallback',
          shipping_service_name: 'Flat delivery',
          shipping_quote_cad_cents: null,
          shipping_estimate: null,
          shipping_quote_at: null,
          payment_method: 'usdc_eth',
          payment_status: 'not_requested',
          referral_id: referral?.id || null,
          referral_code: referral?.code || null,
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

      return json(200, { order_id: order.id, order_number: order.order_number || null, shipping: { live: false, amount_cents: shippingCents, currency: 'USD', service_code: 'flat_rate_fallback', service_name: 'Flat delivery' } });
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
