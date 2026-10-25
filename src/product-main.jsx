import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './storefront-payments.css';
import SiteHeader from './SiteHeader';
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
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function Storefront() {
  const [packs, setPacks] = useState(FALLBACK_PACKS);
  const [selectedPack, setSelectedPack] = useState(FALLBACK_PACKS[0]);
  const [selectedImage, setSelectedImage] = useState(0);
  const [inventoryLots, setInventoryLots] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState(null);
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState(null);
  const [promoState, setPromoState] = useState({ busy: false, message: '', error: false });
  const [referralInput, setReferralInput] = useState('');
  const [referral, setReferral] = useState(null);
  const [referralState, setReferralState] = useState({ busy: false, message: '', error: false });
  const [rewardInput, setRewardInput] = useState('');
  const [reward, setReward] = useState(null);
  const [rewardState, setRewardState] = useState({ busy: false, message: '', error: false });
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({ name: '', email: '', address: '', city: '', region: 'ON', postal: '', notes: '' });
  const [checkoutState, setCheckoutState] = useState({ busy: false, ok: false, message: '', orderNumber: '' });
  const [shippingQuote, setShippingQuote] = useState(null);
  const [shippingRates, setShippingRates] = useState([]);
  const [selectedShipping, setSelectedShipping] = useState(null);
  const [shippingState, setShippingState] = useState({ busy: false, message: '' });

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
      setInventoryLots(Array.isArray(data.lots) ? data.lots : []);
      setSelectedPack(current => next.find(pack => pack.code === current.code) || next[0]);
    }).catch(() => {
      // Keep the current display usable if the backend is temporarily unavailable.
    });
    return () => { alive = false; };
  }, []);

  const unit = useMemo(() => selectedPack.price / selectedPack.qty, [selectedPack]);
  const selectedInStock = selectedPack.available == null || selectedPack.available > 0;
  const selectedExpiry = useMemo(() => {
    const now = new Date();
    const eligible = inventoryLots.filter(lot => {
      if (lot.status !== 'available' || !lot.expiry_date) return false;
      const expiry = new Date(`${lot.expiry_date}T23:59:59Z`);
      if (!(expiry > now)) return false;
      if (selectedPack.code === 'case') {
        return Math.max(0, Number(lot.sealed_on_hand || 0) - Number(lot.sealed_reserved || 0)) >= 1;
      }
      const freeLoose = Math.max(0, Number(lot.loose_on_hand || 0) - Number(lot.loose_reserved || 0));
      return freeLoose >= Number(selectedPack.qty || 1);
    });
    eligible.sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)));
    return eligible[0]?.expiry_date || '';
  }, [inventoryLots, selectedPack]);
  const selectedExpiryLabel = selectedExpiry
    ? new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${selectedExpiry}T12:00:00Z`))
    : 'Not currently available';
  const addToCart = () => {
    if (!selectedInStock) return;
    setCart(selectedPack);
    setPromo(null);
    setPromoInput('');
    setPromoState({ busy: false, message: '', error: false });
    setReferral(null);setReferralInput('');setReferralState({ busy: false, message: '', error: false });
    setReward(null);setRewardInput('');setRewardState({ busy: false, message: '', error: false });
    setShippingQuote(null);setShippingRates([]);setSelectedShipping(null);setShippingState({busy:false,message:''});
    setCartOpen(true);
  };
  const cartSubtotalCents = cart ? Math.round(Number(cart.price) * 100) : 0;
  const cartDiscountCents = promo ? Number(promo.discount_cents || 0) : 0;
  const cartAfterPromoCents = Math.max(0, cartSubtotalCents - cartDiscountCents);
  const cartRewardDiscountCents = reward ? Math.min(cartAfterPromoCents, Math.floor(cartAfterPromoCents * 0.05)) : 0;
  const cartTotalCents = Math.max(0, cartAfterPromoCents - cartRewardDiscountCents);
  const shippingChargeCents = selectedShipping ? Number(selectedShipping.amount_cents || 0) : Number(shippingQuote?.fallback?.amount_cents || 0);
  const checkoutGrandTotalCents = cartTotalCents + shippingChargeCents;
  const formattedPostal = formatCanadianPostal(checkoutForm.postal);
  const shippingAddressReady = !!(checkoutOpen && cart && checkoutForm.name.trim().length >= 2 && checkoutForm.address.trim().length >= 5 && checkoutForm.city.trim().length >= 2 && /^[A-CEGHJ-NPRSTVXY]\d[A-CEGHJ-NPRSTV-Z] \d[A-CEGHJ-NPRSTV-Z]\d$/.test(formattedPostal));

  useEffect(() => {
    if (!shippingAddressReady || !cart) { setShippingQuote(null);setShippingRates([]);setSelectedShipping(null);setShippingState({busy:false,message:''});return; }
    let alive = true;
    const timer = setTimeout(async () => {
      setShippingState({busy:true,message:'Calculating live Chit Chats rates…'});
      try {
        const result = await apiRequest('shipping-quote', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ market:'domestic', name:checkoutForm.name, email:checkoutForm.email, package_id:cart.id, shipping:{ address:checkoutForm.address, city:checkoutForm.city, region:checkoutForm.region, postal:formattedPostal, country:'Canada' } }) });
        if (!alive) return;
        const rates = Array.isArray(result.rates) ? result.rates : [];
        setShippingQuote(result);setShippingRates(rates);
        setSelectedShipping(current => rates.find(rate => rate.service_code === current?.service_code) || rates[0] || null);
        setShippingState({busy:false,message:rates.length?'Live delivery rates loaded.':(result.live_error||'Delivery will be confirmed after review.')});
      } catch (error) {
        if (!alive) return;
        setShippingQuote(null);setShippingRates([]);setSelectedShipping(null);setShippingState({busy:false,message:error.message || 'Live shipping is temporarily unavailable.'});
      }
    }, 700);
    return () => { alive = false;clearTimeout(timer); };
  }, [shippingAddressReady, cart?.id, checkoutForm.name, checkoutForm.email, checkoutForm.address, checkoutForm.city, checkoutForm.region, formattedPostal]);
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
      setReward(null);setRewardState({ busy: false, message: reward ? 'Reapply your referral reward after changing the promo code.' : '', error: false });
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
    if (reward) { setReward(null); setRewardState({ busy: false, message: 'Reapply your referral reward after changing the promo code.', error: false }); }
  }
  async function applyReferral(event) {
    event.preventDefault();
    if (!referralInput.trim()) return;
    if (!checkoutForm.email.trim()) { setReferralState({ busy: false, message: 'Enter your checkout email before applying a referral code.', error: true }); return; }
    setReferralState({ busy: true, message: '', error: false });
    try {
      const result = await apiRequest('referral-validate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purpose: 'attribution', code: referralInput, email: checkoutForm.email }) });
      setReferral(result);setReferralInput(result.code);setReferralState({ busy: false, message: 'Referral recognized. Your referrer will earn a reward after fulfillment.', error: false });
    } catch (error) {
      setReferral(null);setReferralState({ busy: false, message: error.message || 'Referral code could not be applied.', error: true });
    }
  }
  function removeReferral() { setReferral(null);setReferralInput('');setReferralState({ busy: false, message: '', error: false }); }
  async function applyReward(event) {
    event.preventDefault();
    if (!cart || !rewardInput.trim()) return;
    if (!checkoutForm.email.trim()) { setRewardState({ busy: false, message: 'Enter your checkout email before applying a referral reward.', error: true }); return; }
    setRewardState({ busy: true, message: '', error: false });
    try {
      const result = await apiRequest('referral-validate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purpose: 'reward', code: rewardInput, package_id: cart.id, promo_code: promo?.code || null, email: checkoutForm.email }) });
      setReward(result);setRewardInput(result.code);setRewardState({ busy: false, message: `${result.code} reward applied · 5% off`, error: false });
    } catch (error) {
      setReward(null);setRewardState({ busy: false, message: error.message || 'Referral reward could not be applied.', error: true });
    }
  }
  function removeReward() { setReward(null);setRewardInput('');setRewardState({ busy: false, message: '', error: false }); }
  const patchCheckout = (key, value) => {
    setCheckoutForm(current => ({ ...current, [key]: value }));
    if (['name','email','address','city','region','postal'].includes(key)) { setShippingRates([]);setSelectedShipping(null);setShippingQuote(null); }
    if (key === 'email') {
      if (reward) { setReward(null); setRewardState({ busy: false, message: 'Reapply the referral reward after changing your email.', error: false }); }
      if (referral) { setReferral(null); setReferralState({ busy: false, message: 'Reapply the referral code after changing your email.', error: false }); }
    }
  };
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
          referral_code: referral?.code || null,
          referral_reward_code: reward?.code || null,
          shipping: {
            address: checkoutForm.address,
            city: checkoutForm.city,
            region: checkoutForm.region,
            postal: formatCanadianPostal(checkoutForm.postal),
            country: 'Canada',
          },
          shipping_service_code: selectedShipping?.service_code || null,
          expected_shipping_cents: selectedShipping?.amount_cents ?? shippingQuote?.fallback?.amount_cents ?? null,
          notes: checkoutForm.notes,
        }),
      });
      setCheckoutState({ busy: false, ok: true, message: 'Request received. Payment is not due until the order is reviewed and approved.', orderNumber: result.order_number || '' });
      setCart(null);
      setPromo(null);setPromoInput('');
      setReferral(null);setReferralInput('');
      setReward(null);setRewardInput('');
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

    <SiteHeader active="products" cartCount={cart?.qty || 0} onCartClick={() => setCartOpen(true)} />

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
        <div className="expiry-reference" aria-live="polite">
          <div className="expiry-reference-icon"><Icon name="calendar" size={19}/></div>
          <div className="expiry-reference-copy">
            <span>Current inventory expiry</span>
            <strong>{selectedExpiryLabel}</strong>
            <small>Based on available {selectedPack.label.toLowerCase()} inventory.</small>
          </div>
        </div>
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
        <div className="cart-summary"><div><span>Product subtotal</span><b>${money(cartSubtotalCents/100)} CAD</b></div><p>Promo codes are applied at checkout so you can review the discounted price before submitting.</p></div><div className="cart-payment-preview"><span>PAYMENT AFTER APPROVAL</span><b>Interac e-Transfer</b><small>Exact payment instructions are provided only after the request is approved.</small></div><button className="checkout-button" onClick={()=>{setCheckoutState({busy:false,ok:false,message:'',orderNumber:''});setCheckoutOpen(true)}}>Continue to checkout <Icon name="chevron" size={17}/></button><p className="checkout-disclaimer">No payment is taken when you submit the request.</p></>}
    </aside></div>

    {checkoutOpen&&<div className="store-checkout-overlay" onMouseDown={e=>e.target===e.currentTarget&&!checkoutState.busy&&setCheckoutOpen(false)}>
      <section className="store-checkout-card" role="dialog" aria-modal="true" aria-label="Canadian checkout">
        <button className="store-checkout-x" type="button" onClick={()=>setCheckoutOpen(false)} disabled={checkoutState.busy}>×</button>
        {checkoutState.ok?<div className="store-checkout-success"><span>REQUEST RECEIVED</span><h2>{checkoutState.orderNumber||'Order submitted'}</h2><p>{checkoutState.message}</p><div className="store-payment-method"><div><span>PAYMENT METHOD</span><strong>Interac e-Transfer</strong></div><p>Do not send funds yet. You will receive the exact CAD amount, e-Transfer address and order reference after approval.</p></div><button type="button" onClick={()=>setCheckoutOpen(false)}>Close</button></div>:<>
          <div className="store-checkout-head"><span>CANADIAN CHECKOUT</span><h2>Review your price.</h2><p>Apply a promo code and, if earned, a referral reward. Your final product total updates before you submit the request.</p></div>
          <div className="checkout-price-panel">
            <div className="checkout-price-product"><div><span>SELECTED PACKAGE</span><strong>{cart?.label||'Selected package'}</strong></div><b>${money(cartSubtotalCents/100)} CAD</b></div>
            <div className="checkout-price-lines">
              <div><span>Product subtotal</span><strong>${money(cartSubtotalCents/100)} CAD</strong></div>
              {promo&&<div className="checkout-discount-line"><span>Promo · {promo.code}</span><strong>−${money(cartDiscountCents/100)} CAD</strong></div>}
              {reward&&<div className="checkout-discount-line referral-reward-line"><span>Referral reward · {reward.code}</span><strong>−${money(cartRewardDiscountCents/100)} CAD</strong></div>}
              <div><span>Product total</span><strong>${money(cartTotalCents/100)} CAD</strong></div>
              <div className="checkout-shipping-line"><span>{selectedShipping?.service_name || 'Delivery'}</span><strong>{shippingState.busy?'Calculating…':shippingRates.length?`$${money(shippingChargeCents/100)} CAD`:shippingQuote?.fallback?.amount_cents?`$${money(shippingChargeCents/100)} CAD`:'Confirmed after review'}</strong></div>
              <div className="checkout-final-line"><span>{shippingRates.length?'Order total':'Product total'}</span><strong>${money((shippingRates.length?checkoutGrandTotalCents:cartTotalCents)/100)} CAD</strong></div>
            </div>
            <div className="checkout-code-grid">
              <form className="checkout-promo-form" onSubmit={applyPromo}><label htmlFor="checkout-promo-code">Promo code</label><div><input id="checkout-promo-code" value={promoInput} onChange={e=>setPromoInput(e.target.value.toUpperCase())} placeholder="Enter promo code" maxLength="32" disabled={promoState.busy}/>{promo?<button type="button" className="promo-remove" onClick={removePromo}>Remove</button>:<button type="submit" disabled={promoState.busy||!promoInput.trim()}>{promoState.busy?'Checking…':'Apply'}</button>}</div>{promoState.message&&<p className={`promo-message ${promoState.error?'is-error':'is-valid'}`} role="status">{promoState.message}</p>}</form>
              <form className="checkout-promo-form referral-reward-form" onSubmit={applyReward}><label htmlFor="checkout-reward-code">Referral reward</label><div><input id="checkout-reward-code" value={rewardInput} onChange={e=>setRewardInput(e.target.value.toUpperCase())} placeholder="REF5-XXXXXXXX" maxLength="32" disabled={rewardState.busy}/>{reward?<button type="button" className="promo-remove" onClick={removeReward}>Remove</button>:<button type="submit" disabled={rewardState.busy||!rewardInput.trim()}>{rewardState.busy?'Checking…':'Apply 5%'}</button>}</div>{rewardState.message&&<p className={`promo-message ${rewardState.error?'is-error':'is-valid'}`} role="status">{rewardState.message}</p>}<small>Each reward code is single-use for 5% off and stacks after your promo code.</small></form>
            </div>
            <form className="checkout-referral-form" onSubmit={applyReferral}><div><label htmlFor="checkout-referral-code">Were you referred by someone?</label><small>Enter their referral code. Your order price does not change; they earn a 5% reward after your order is fulfilled.</small></div><div className="checkout-referral-control"><input id="checkout-referral-code" value={referralInput} onChange={e=>setReferralInput(e.target.value.toUpperCase())} placeholder="Referral code" maxLength="32" disabled={referralState.busy}/>{referral?<button type="button" className="promo-remove" onClick={removeReferral}>Remove</button>:<button type="submit" disabled={referralState.busy||!referralInput.trim()}>{referralState.busy?'Checking…':'Apply'}</button>}</div>{referralState.message&&<p className={`promo-message ${referralState.error?'is-error':'is-valid'}`} role="status">{referralState.message}</p>}</form>
            <p className="checkout-price-note">Referral rewards are single-use and available only to the email registered to that referral code. Regular promo codes and one referral reward can be used together. When Chit Chats is configured, live delivery rates are calculated from your address and packed dimensions before submission. Otherwise delivery is confirmed during review.</p>
          </div>
          <form className="store-checkout-form" onSubmit={submitDomestic}><label><span>Full name</span><input required minLength="2" maxLength="100" autoComplete="name" value={checkoutForm.name} onChange={e=>patchCheckout('name',e.target.value)}/></label><label><span>Email</span><input required type="email" autoComplete="email" value={checkoutForm.email} onChange={e=>patchCheckout('email',e.target.value)}/></label><label className="full"><span>Street address</span><input required minLength="5" autoComplete="street-address" value={checkoutForm.address} onChange={e=>patchCheckout('address',e.target.value)}/></label><label><span>City</span><input required minLength="2" autoComplete="address-level2" value={checkoutForm.city} onChange={e=>patchCheckout('city',e.target.value)}/></label><label><span>Province / territory</span><select value={checkoutForm.region} onChange={e=>patchCheckout('region',e.target.value)}>{CANADIAN_PROVINCES.map(p=><option key={p.code} value={p.code}>{p.name}</option>)}</select></label><label><span>Postal code</span><input required maxLength="7" placeholder="K1A 0B1" autoComplete="postal-code" value={checkoutForm.postal} onChange={e=>patchCheckout('postal',e.target.value.toUpperCase())}/></label><label className="full"><span>Order note (optional)</span><textarea maxLength="1000" rows="2" value={checkoutForm.notes} onChange={e=>patchCheckout('notes',e.target.value)}/></label><div className="checkout-shipping-picker full"><div className="checkout-shipping-head"><div><span>DELIVERY</span><strong>{shippingRates.length?'Choose a Chit Chats service':'Live shipping'}</strong></div><Icon name="truck" size={20}/></div>{!shippingAddressReady?<p>Complete your delivery address to calculate shipping.</p>:shippingState.busy?<p>Calculating available Chit Chats services…</p>:shippingRates.length?<div className="checkout-shipping-options">{shippingRates.map(rate=><label key={rate.service_code} className={selectedShipping?.service_code===rate.service_code?'selected':''}><input type="radio" name="shipping-service" checked={selectedShipping?.service_code===rate.service_code} onChange={()=>setSelectedShipping(rate)}/><span><b>{rate.service_name}</b><small>{[rate.estimate,rate.tracking].filter(Boolean).join(' · ')}</small></span><strong>${money(rate.amount_cents/100)} CAD</strong></label>)}</div>:<p>{shippingState.message||'Delivery will be confirmed during order review.'}</p>}</div><div className="store-payment-method full"><div><span>PAYMENT METHOD</span><strong>Interac e-Transfer</strong></div><p>Payment is requested after approval. Do not transfer funds at this stage.</p></div>{checkoutState.message&&<div className="store-checkout-error full" role="alert">{checkoutState.message}</div>}<button className="store-submit full" disabled={checkoutState.busy}>{checkoutState.busy?'Submitting…':<>Submit request · ${money((shippingRates.length?checkoutGrandTotalCents:cartTotalCents)/100)} CAD <Icon name="chevron" size={17}/></>}</button></form>
        </>}
      </section>
    </div>}

    <div className="mobile-atc"><div><small>{selectedPack.label}</small><b>${money(selectedPack.price)} CAD</b></div><button onClick={addToCart} disabled={!selectedInStock}>{selectedInStock?'Add to cart':'Unavailable'}</button></div>
  </div>;
}


createRoot(document.getElementById('root')).render(<Storefront/>);
