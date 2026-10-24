import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './storefront-payments.css';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { CANADIAN_PROVINCES, formatCanadianPostal } from './canada';

const PRODUCT_IMAGES = [
  { src: '/assets/bac-water-front.webp', alt: 'Bacteriostatic Water for Injection USP 30 mL vial front view', label: 'Front' },
  { src: '/assets/bac-water-angle.webp', alt: 'Bacteriostatic Water for Injection USP 30 mL vial angled view', label: 'Angled' }
];

const FALLBACK_PACKS = [
  { id: 'single', code: 'single', sku: 'RW-BAC-01', label: 'Single vial', qty: 1, price: 15, note: '$15.00 / vial', available: null },
  { id: 'five', code: 'five', sku: 'RW-BAC-05', label: '5-vial pack', qty: 5, price: 70, note: '$14.00 / vial', available: null },
  { id: 'ten', code: 'ten', sku: 'RW-BAC-10', label: '10-vial pack', qty: 10, price: 130, note: '$13.00 / vial', badge: 'Popular', available: null },
  { id: 'case', code: 'case', sku: 'RW-BAC-25', label: 'Factory-sealed case', qty: 25, price: 300, note: '$12.00 / vial', badge: 'Best value', available: null }
];

const API = '/.netlify/functions/recon-api';
const money = value => Number(value || 0).toFixed(2);

async function apiRequest(mode, options = {}) {
  const response = await fetch(`${API}?mode=${encodeURIComponent(mode)}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

function Icon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' };
  const paths = {
    cart: <><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.5h7.9a2 2 0 0 0 1.9-1.4L21 7H6"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    truck: <><path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
    box: <><path d="m21 8-9 5-9-5"/><path d="M3 8l9-5 9 5v8l-9 5-9-5Z"/><path d="M12 13v8"/></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></>,
    leaf: <><path d="M12 21V8"/><path d="M12 13C8 13 5 10 5 6c4 0 7 3 7 7Z"/><path d="M12 16c4 0 7-3 7-7-4 0-7 3-7 7Z"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function Storefront() {
  const [packs, setPacks] = useState(FALLBACK_PACKS);
  const [selectedPack, setSelectedPack] = useState(FALLBACK_PACKS[0]);
  const [selectedImage, setSelectedImage] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState(null);
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState(null);
  const [promoState, setPromoState] = useState({ busy: false, message: '', error: false });
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({ name: '', email: '', address: '', city: '', region: 'ON', postal: '', notes: '' });
  const [checkoutState, setCheckoutState] = useState({ busy: false, ok: false, message: '', orderNumber: '' });

  useEffect(() => {
    let alive = true;
    apiRequest('catalogue').then(data => {
      if (!alive || !data?.packages?.length) return;
      const next = data.packages.map(pack => ({
        id: pack.id,
        code: pack.code,
        sku: pack.sku,
        label: pack.label,
        qty: Number(pack.vials_per_pack),
        price: Number(pack.price_cents) / 100,
        note: `$${(Number(pack.price_cents) / 100 / Number(pack.vials_per_pack)).toFixed(2)} / vial`,
        badge: pack.code === 'ten' ? 'Popular' : pack.code === 'case' ? 'Best value' : undefined,
        available: Number(pack.available_packs ?? 0),
      }));
      setPacks(next);
      setSelectedPack(current => next.find(pack => pack.code === current.code) || next[0]);
    }).catch(() => {
      // Keep the current display usable if the backend is temporarily unavailable.
    });
    return () => { alive = false; };
  }, []);

  const unit = useMemo(() => selectedPack.price / selectedPack.qty, [selectedPack]);
  const selectedInStock = selectedPack.available == null || selectedPack.available > 0;
  const addToCart = () => {
    if (!selectedInStock) return;
    setCart(selectedPack);
    setPromo(null);
    setPromoInput('');
    setPromoState({ busy: false, message: '', error: false });
    setCartOpen(true);
  };
  const cartSubtotalCents = cart ? Math.round(Number(cart.price) * 100) : 0;
  const cartDiscountCents = promo ? Number(promo.discount_cents || 0) : 0;
  const cartTotalCents = Math.max(0, cartSubtotalCents - cartDiscountCents);
  async function applyPromo(event) {
    event.preventDefault();
    if (!cart || !promoInput.trim()) return;
    setPromoState({ busy: true, message: '', error: false });
    try {
      const result = await apiRequest('promo-validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: promoInput, package_id: cart.id }),
      });
      setPromo(result);
      setPromoInput(result.code);
      setPromoState({ busy: false, message: `${result.code} applied`, error: false });
    } catch (error) {
      setPromo(null);
      setPromoState({ busy: false, message: error.message || 'Promo code could not be applied.', error: true });
    }
  }
  function removePromo() {
    setPromo(null);
    setPromoInput('');
    setPromoState({ busy: false, message: '', error: false });
  }
  const patchCheckout = (key, value) => setCheckoutForm(current => ({ ...current, [key]: value }));
  async function submitDomestic(event) {
    event.preventDefault();
    if (!cart) return;
    setCheckoutState({ busy: true, ok: false, message: '', orderNumber: '' });
    try {
      const result = await apiRequest('submit-domestic', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: checkoutForm.name,
          email: checkoutForm.email,
          package_id: cart.id,
          promo_code: promo?.code || null,
          shipping: {
            address: checkoutForm.address,
            city: checkoutForm.city,
            region: checkoutForm.region,
            postal: formatCanadianPostal(checkoutForm.postal),
            country: 'Canada',
          },
          notes: checkoutForm.notes,
        }),
      });
      setCheckoutState({ busy: false, ok: true, message: 'Request received. Payment is not due until the order is reviewed and approved.', orderNumber: result.order_number || '' });
      setCart(null);
      setPromo(null);
      setPromoInput('');
      setCartOpen(false);
    } catch (error) {
      setCheckoutState({ busy: false, ok: false, message: error.message || 'Could not submit request.', orderNumber: '' });
    }
  }


  return <div className="app-shell">
    <div className="trustbar"><div className="container trustbar-inner">
      <span><Icon name="leaf" size={14}/> Canadian storefront</span><span className="trustbar-sep">•</span>
      <span><Icon name="shield" size={14}/> DIN-labelled product</span><span className="trustbar-sep">•</span>
      <span><Icon name="truck" size={15}/> Canada-wide fulfilment</span>
    </div></div>

    <header className="site-header"><div className="container nav-wrap">
      <a className="brand brand-logo-link" href="#top" aria-label="Recon Water home"><img className="brand-logo" src="/assets/recon-water-logo.webp" alt="Recon Water" /></a>
      <nav className="desktop-nav" aria-label="Primary"><a href="#product">Product</a><a href="/international/">International</a></nav>
      <button className="cart-trigger" onClick={() => setCartOpen(true)} aria-label="Open cart"><Icon name="cart"/><span>Cart</span><b>{cart?.qty || 0}</b></button>
    </div></header>

    <main id="top"><section className="product-hero" id="product"><div className="container hero-grid">
      <div className="gallery-column">
        <div className="gallery-kicker">HOSPIRA / PFIZER CANADA</div>
        <div className="product-stage"><div className="stage-aura"/><img src={PRODUCT_IMAGES[selectedImage].src} alt={PRODUCT_IMAGES[selectedImage].alt} className="product-image"/><div className="stage-badge"><Icon name="shield" size={16}/><span><b>DIN 00038202</b><small>Marketed in Canada</small></span></div></div>
        <div className="thumb-row">{PRODUCT_IMAGES.map((img,index)=><button key={img.src} onClick={()=>setSelectedImage(index)} className={`thumb ${selectedImage===index?'active':''}`}><img src={img.src} alt=""/><span>{img.label}</span></button>)}<div className="thumb-spec"><span>30</span><small>mL</small></div></div>
        <p className="image-note">Product imagery based on the current supplied vial and label reference.</p>
      </div>

      <div className="purchase-column">
        <div className="eyebrow"><span/> Canadian medical supply</div>
        <h1>Bacteriostatic Water<br/><em>for Injection USP</em></h1>
        <p className="subline">30 mL multidose vial · DIN 00038202 · Pfizer Canada ULC</p>
        <div className="hero-price-row"><div><span>From</span><strong>${Math.min(...packs.map(p=>p.price)).toFixed(2)} <small>CAD</small></strong></div><div className={`stock ${selectedInStock?'':'out'}`}><i/>{selectedInStock?'In stock':'Unavailable'}</div></div>
        <div className="divider"/>
        <div className="pack-label"><span>Choose quantity</span><b>{selectedPack.label}</b></div>
        <div className="pack-grid">{packs.map(pack=><button key={pack.id} onClick={()=>setSelectedPack(pack)} className={`pack-card ${selectedPack.id===pack.id?'selected':''} ${pack.available===0?'sold-out':''}`}>
          {pack.badge && <span className="pack-badge">{pack.badge}</span>}<span className="radio-dot"><i/></span><b>{pack.label}</b><strong>${money(pack.price)}</strong><small>{pack.note}{pack.available != null ? ` · ${pack.available} available` : ''}</small>
        </button>)}</div>
        <div className="selected-total"><div><span>Your selection</span><b>{selectedPack.qty} {selectedPack.qty===1?'vial':'vials'}</b></div><div className="selected-price"><strong>${money(selectedPack.price)}</strong><small>CAD · ${unit.toFixed(2)} / vial</small></div></div>
        <button className="primary-atc" onClick={addToCart} disabled={!selectedInStock}><Icon name="cart"/> {selectedInStock?'Add to cart':'Unavailable'} <span>${money(selectedPack.price)} CAD</span></button>
        <div className="micro-trust"><span><Icon name="lock" size={16}/> Secure checkout</span><span><Icon name="box" size={16}/> Protective packaging</span><span><Icon name="shield" size={16}/> DIN verified</span></div>
        <div className="product-note"><Icon name="info" size={18}/><p>Product and order information only. Use and handling should follow the manufacturer’s labelling and applicable professional guidance.</p></div>
      </div>
    </div></section>

    <section className="value-strip"><div className="container value-grid">
      <article><Icon name="shield"/><div><b>Verified product identity</b><p>DIN, manufacturer and format are visible before purchase.</p></div></article>
      <article><Icon name="box"/><div><b>Built for a single product</b><p>No catalogue noise. Everything revolves around the 30 mL vial.</p></div></article>
      <article><Icon name="truck"/><div><b>Canadian fulfilment</b><p>Clear shipping expectations without burying details in a policy page.</p></div></article>
    </div></section>

  </main>

    <div className={`cart-drawer ${cartOpen?'open':''}`} aria-hidden={!cartOpen}><button className="cart-scrim" onClick={()=>setCartOpen(false)} aria-label="Close cart"/><aside className="cart-panel"><div className="cart-head"><div><span>Your cart</span><small>{cart?`${cart.qty} ${cart.qty===1?'vial':'vials'}`:'Empty'}</small></div><button onClick={()=>setCartOpen(false)}>×</button></div>
      {!cart ? <div className="empty-cart"><Icon name="cart" size={28}/><h3>Your cart is empty</h3><p>Select a quantity and add it to your cart.</p></div> : <><div className="cart-product"><div className="cart-image"><img src={PRODUCT_IMAGES[0].src} alt="Hospira Bacteriostatic Water vial"/></div><div><b>Bacteriostatic Water for Injection USP</b><span>30 mL · {cart.label}</span><strong>${money(cart.price)} CAD</strong></div></div>
        <form className="promo-entry" onSubmit={applyPromo}><label htmlFor="promo-code">Promo code</label><div><input id="promo-code" value={promoInput} onChange={e=>setPromoInput(e.target.value.toUpperCase())} placeholder="Enter code" maxLength="32" disabled={promoState.busy}/>{promo?<button type="button" className="promo-remove" onClick={removePromo}>Remove</button>:<button type="submit" disabled={promoState.busy||!promoInput.trim()}>{promoState.busy?'Checking…':'Apply'}</button>}</div>{promoState.message&&<p className={`promo-message ${promoState.error?'is-error':'is-valid'}`} role="status">{promoState.message}</p>}</form>
        <div className="cart-summary"><div><span>Subtotal</span><b>${money(cartSubtotalCents/100)} CAD</b></div>{promo&&<div className="promo-discount-row"><span>Promo · {promo.code}</span><b>−${money(cartDiscountCents/100)} CAD</b></div>}{promo&&<div className="cart-total-row"><span>Product total</span><b>${money(cartTotalCents/100)} CAD</b></div>}<p>Delivery and any applicable taxes are confirmed during review.</p></div><div className="cart-payment-preview"><span>PAYMENT AFTER APPROVAL</span><b>Interac e-Transfer</b><small>Exact amount and transfer reference are provided after the request is approved.</small></div><button className="checkout-button" onClick={()=>{setCheckoutState({busy:false,ok:false,message:'',orderNumber:''});setCheckoutOpen(true)}}>Continue to checkout <Icon name="chevron" size={17}/></button><p className="checkout-disclaimer">Do not send an e-Transfer before approval. Promo codes apply to Canadian product subtotal only.</p></>}
    </aside></div>

    {checkoutOpen&&<div className="store-checkout-overlay" onMouseDown={e=>e.target===e.currentTarget&&!checkoutState.busy&&setCheckoutOpen(false)}><section className="store-checkout-card" role="dialog" aria-modal="true" aria-label="Canadian checkout"><button className="store-checkout-x" type="button" onClick={()=>setCheckoutOpen(false)} disabled={checkoutState.busy}>×</button>{checkoutState.ok?<div className="store-checkout-success"><span>REQUEST RECEIVED</span><h2>{checkoutState.orderNumber||'Order submitted'}</h2><p>{checkoutState.message}</p><div className="store-payment-method"><div><span>PAYMENT METHOD</span><strong>Interac e-Transfer</strong></div><p>Do not send funds yet. You will receive the exact CAD amount, e-Transfer address and order reference after approval.</p></div><button type="button" onClick={()=>setCheckoutOpen(false)}>Close</button></div>:<><div className="store-checkout-head"><span>CANADIAN REQUEST</span><h2>Delivery details.</h2><p>Submit your request for review. Payment is requested only after inventory is approved and reserved.</p></div><div className="store-checkout-summary"><div><span>{cart?.label||'Selected package'}</span><strong>${money(cartTotalCents/100)} CAD</strong></div>{promo&&<small>Promo {promo.code} applied · −${money(cartDiscountCents/100)} CAD</small>}</div><form className="store-checkout-form" onSubmit={submitDomestic}><label><span>Full name</span><input required minLength="2" maxLength="100" autoComplete="name" value={checkoutForm.name} onChange={e=>patchCheckout('name',e.target.value)}/></label><label><span>Email</span><input required type="email" autoComplete="email" value={checkoutForm.email} onChange={e=>patchCheckout('email',e.target.value)}/></label><label className="full"><span>Street address</span><input required minLength="5" autoComplete="street-address" value={checkoutForm.address} onChange={e=>patchCheckout('address',e.target.value)}/></label><label><span>City</span><input required minLength="2" autoComplete="address-level2" value={checkoutForm.city} onChange={e=>patchCheckout('city',e.target.value)}/></label><label><span>Province / territory</span><select value={checkoutForm.region} onChange={e=>patchCheckout('region',e.target.value)}>{CANADIAN_PROVINCES.map(p=><option key={p.code} value={p.code}>{p.name}</option>)}</select></label><label><span>Postal code</span><input required maxLength="7" placeholder="K1A 0B1" autoComplete="postal-code" value={checkoutForm.postal} onChange={e=>patchCheckout('postal',e.target.value.toUpperCase())}/></label><label className="full"><span>Order note (optional)</span><textarea maxLength="1000" rows="2" value={checkoutForm.notes} onChange={e=>patchCheckout('notes',e.target.value)}/></label><div className="store-payment-method full"><div><span>PAYMENT METHOD</span><strong>Interac e-Transfer</strong></div><p>Payment is requested after approval. Do not transfer funds at this stage.</p></div>{checkoutState.message&&<div className="store-checkout-error full" role="alert">{checkoutState.message}</div>}<button className="store-submit full" disabled={checkoutState.busy}>{checkoutState.busy?'Submitting…':'Submit request for review'} <Icon name="chevron" size={17}/></button></form></>}</section></div>}

    <div className="mobile-atc"><div><small>{selectedPack.label}</small><b>${money(selectedPack.price)} CAD</b></div><button onClick={addToCart} disabled={!selectedInStock}>{selectedInStock?'Add to cart':'Unavailable'}</button></div>
  </div>;
}

function AdminApp() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session || null); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setDashboard(null); return; }
    loadAdmin();
  }, [session]);

  async function authHeaders() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function loadAdmin() {
    setMessage('');
    try {
      const data = await apiRequest('admin', { headers: await authHeaders() });
      setDashboard(data);
      const nextDrafts = {};
      for (const pack of data.packages || []) nextDrafts[pack.id] = { price: Number(pack.price_cents || 0) / 100, active: Boolean(pack.active), max: Number(pack.max_per_request || 10) };
      setDrafts(nextDrafts);
    } catch (error) {
      setMessage(error.message);
      if (/Authentication|expired/i.test(error.message)) await supabase.auth.signOut();
    }
  }

  async function signIn(event) {
    event.preventDefault(); setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
  }

  async function savePackage(pack) {
    const draft = drafts[pack.id];
    const cents = Math.round(Number(draft.price) * 100);
    setSaving(pack.id); setMessage('');
    try {
      await apiRequest('set-package', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ package_id: pack.id, price_cents: cents, active: Boolean(draft.active), max_per_request: Number(draft.max) }),
      });
      setMessage(`${pack.label} updated.`);
      await loadAdmin();
    } catch (error) { setMessage(error.message); }
    finally { setSaving(''); }
  }

  function patchDraft(id, key, value) { setDrafts(all => ({ ...all, [id]: { ...all[id], [key]: value } })); }

  if (loading) return <div className="admin-page"><div className="admin-card"><p>Loading admin…</p></div></div>;
  if (!isSupabaseConfigured) return <div className="admin-page"><div className="admin-card admin-setup"><img src="/assets/recon-water-logo.webp" alt="Recon Water"/><h1>Supabase Auth is not configured</h1><p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to the site environment and redeploy.</p></div></div>;
  if (!session) return <div className="admin-page"><form className="admin-card admin-login" onSubmit={signIn}><img src="/assets/recon-water-logo.webp" alt="Recon Water"/><span className="admin-kicker">RECON WATER ADMIN</span><h1>Sign in</h1><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>{message&&<div className="admin-alert">{message}</div>}<button type="submit">Sign in</button></form></div>;
  if (!dashboard) return <div className="admin-page"><div className="admin-card admin-setup"><h1>Checking admin access</h1><p>{message || 'Connecting to Recon Water…'}</p>{message&&<button onClick={()=>supabase.auth.signOut()}>Sign out</button>}</div></div>;

  return <div className="admin-shell"><header className="admin-header"><img src="/assets/recon-water-logo.webp" alt="Recon Water"/><div><span>{dashboard.admin?.email}</span><button onClick={()=>supabase.auth.signOut()}>Sign out</button></div></header><main className="admin-main">
    <div className="admin-title"><div><span>SUPABASE CONNECTED</span><h1>Store operations</h1></div><button onClick={loadAdmin}>Refresh</button></div>
    {message&&<div className="admin-alert admin-alert-wide">{message}</div>}
    <section className="admin-panel"><div className="admin-panel-head"><div><h2>Packaging & pricing</h2><p>Prices and publication status are server-authoritative and update the storefront.</p></div></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>SKU</th><th>Package</th><th>Vials</th><th>Available packs</th><th>Price CAD</th><th>Active</th><th>Max/request</th><th></th></tr></thead><tbody>
      {(dashboard.packages||[]).map(pack=>{const d=drafts[pack.id]||{};return <tr key={pack.id}><td><code>{pack.sku}</code></td><td><b>{pack.label}</b></td><td>{pack.vials_per_pack}</td><td>{pack.available_packs}</td><td><input type="number" min="0.01" step="0.01" value={d.price ?? ''} onChange={e=>patchDraft(pack.id,'price',e.target.value)}/></td><td><input className="admin-check" type="checkbox" checked={Boolean(d.active)} onChange={e=>patchDraft(pack.id,'active',e.target.checked)}/></td><td><input type="number" min="1" max="100" step="1" value={d.max ?? 10} onChange={e=>patchDraft(pack.id,'max',e.target.value)}/></td><td><button onClick={()=>savePackage(pack)} disabled={saving===pack.id}>{saving===pack.id?'Saving…':'Save'}</button></td></tr>})}
    </tbody></table></div></section>

    <section className="admin-panel"><div className="admin-panel-head"><div><h2>Inventory lots</h2><p>Read-only here; stock mutations remain on the protected server-side inventory workflow.</p></div></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Lot</th><th>Status</th><th>Expiry</th><th>Loose</th><th>Loose reserved</th><th>Sealed cases</th><th>Sealed reserved</th></tr></thead><tbody>
      {(dashboard.lots||[]).map(lot=><tr key={lot.id}><td><b>{lot.lot_code}</b></td><td>{lot.status}</td><td>{lot.expiry_date||'—'}</td><td>{lot.loose_on_hand}</td><td>{lot.loose_reserved}</td><td>{lot.sealed_on_hand}</td><td>{lot.sealed_reserved}</td></tr>)}
    </tbody></table></div></section>

    <section className="admin-panel"><div className="admin-panel-head"><div><h2>Recent orders</h2><p>Latest 50 records from Supabase.</p></div></div>{(dashboard.orders||[]).length===0?<div className="admin-empty">No orders yet.</div>:<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Subtotal</th><th>Created</th></tr></thead><tbody>{dashboard.orders.map(order=><tr key={order.id}><td><b>{order.order_number}</b></td><td>{order.customer_email||order.customer_name||'—'}</td><td>{order.status}</td><td>${money(Number(order.subtotal_cents||0)/100)} CAD</td><td>{new Date(order.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>}</section>
  </main></div>;
}

const adminRoute = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
createRoot(document.getElementById('root')).render(adminRoute ? <AdminApp/> : <Storefront/>);
