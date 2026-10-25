let _noop;

export function chitChatsConfigured() {
  return !!(process.env.CHITCHATS_CLIENT_ID && process.env.CHITCHATS_ACCESS_TOKEN);
}

export function chitChatsEnvironment() {
  return String(process.env.CHITCHATS_ENVIRONMENT || 'production').toLowerCase() === 'staging' ? 'staging' : 'production';
}

function baseUrl() {
  return chitChatsEnvironment() === 'staging' ? 'https://staging.chitchats.com' : 'https://chitchats.com';
}

async function ccFetch(path, options = {}) {
  if (!chitChatsConfigured()) throw new Error('Chit Chats is not configured');
  const id = encodeURIComponent(process.env.CHITCHATS_CLIENT_ID);
  const response = await fetch(`${baseUrl()}/api/v1/clients/${id}${path}`, {
    ...options,
    headers: {
      Authorization: process.env.CHITCHATS_ACCESS_TOKEN,
      ...(options.body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `Chit Chats request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

export function validateShippingProfile(profile) {
  if (!profile || !profile.active) return 'Shipping profile is not active';
  for (const key of ['weight_g','length_cm','width_cm','height_cm']) {
    if (!(Number(profile[key]) > 0)) return 'Packed weight and dimensions are required';
  }
  return null;
}

function buildDomesticPayload({ profile, recipient, valueCents, sku, postageType = 'unknown', orderId = '' }) {
  const province = String(recipient.region || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(province)) throw new Error('Use a valid two-letter Canadian province or territory code');
  return {
    name: String(recipient.name || '').trim(),
    address_1: String(recipient.address || '').trim(),
    city: String(recipient.city || '').trim(),
    province_code: province,
    postal_code: String(recipient.postal || '').trim(),
    country_code: 'CA',
    email: String(recipient.email || '').trim() || undefined,
    package_contents: 'merchandise',
    description: String(profile.label || sku || 'Merchandise').trim(),
    value: (Math.max(0, Number(valueCents || 0)) / 100).toFixed(2),
    value_currency: 'cad',
    order_id: String(orderId || ''),
    order_store: 'other',
    package_type: profile.package_type || 'parcel',
    weight_unit: 'g',
    weight: Number(profile.weight_g),
    size_unit: 'cm',
    size_x: Number(profile.length_cm),
    size_y: Number(profile.width_cm),
    size_z: Number(profile.height_cm),
    insurance_requested: false,
    signature_requested: false,
    hazmat_code: null,
    postage_type: postageType,
    cheapest_postage_type_requested: 'no',
    ship_date: 'today'
  };
}

export async function getChitChatsRates(args) {
  const profileError = validateShippingProfile(args.profile);
  if (profileError) throw new Error(profileError);
  const payload = buildDomesticPayload({ ...args, postageType: 'unknown' });
  let shipmentId = null;
  try {
    const created = await ccFetch('/shipments', { method: 'POST', body: JSON.stringify(payload) });
    const shipment = created?.shipment || created;
    shipmentId = shipment?.id || null;
    const rawRates = Array.isArray(shipment?.rates) ? shipment.rates : [];
    if (!rawRates.length) throw new Error('No Chit Chats shipping services are available for this address');
    const markup = Math.max(0, Number(process.env.CHITCHATS_SHIPPING_MARKUP_PERCENT || 0));
    const rates = rawRates.map(rate => {
      const baseCad = Math.max(0, Math.round(Number(rate.payment_amount || rate.purchase_amount || 0) * 100));
      if (!baseCad) return null;
      const amountCents = Math.round(baseCad * (1 + markup / 100));
      return {
        service_code: rate.postage_type,
        service_name: rate.postage_description || rate.postage_type,
        estimate: rate.delivery_time_description || '',
        tracking: rate.tracking_type_description || '',
        amount_cents: amountCents,
        currency: 'CAD',
        cad_amount_cents: baseCad,
        markup_percent: markup
      };
    }).filter(Boolean).sort((a,b) => a.amount_cents - b.amount_cents);
    if (!rates.length) throw new Error('No usable Chit Chats shipping rates were returned');
    return rates;
  } finally {
    if (shipmentId) {
      try { await ccFetch(`/shipments/${encodeURIComponent(shipmentId)}`, { method: 'DELETE' }); } catch { /* best-effort cleanup */ }
    }
  }
}
