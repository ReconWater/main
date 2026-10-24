import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './international-page.css';

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
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    truck: <><path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></>,
    leaf: <><path d="M12 21V8"/><path d="M12 13C8 13 5 10 5 6c4 0 7 3 7 7Z"/><path d="M12 16c4 0 7-3 7-7-4 0-7 3-7 7Z"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    arrowLeft: <><path d="m15 18-6-6 6-6"/><path d="M9 12h10"/></>,
    cart: <><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.5h7.9a2 2 0 0 0 1.9-1.4L21 7H6"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function InternationalOrders() {
  const [qty, setQty] = useState(1);
  const [form, setForm] = useState({ name: '', email: '', address: '', city: '', region: '', postal: '', country: '', notes: '' });
  const [status, setStatus] = useState({ busy: false, message: '', ok: false });

  const productSubtotal = qty * 20;
  const patch = (key, value) => setForm(current => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    if (qty < 1 || qty > 5) return;
    setStatus({ busy: true, message: '', ok: false });
    try {
      const data = await apiRequest('submit-international', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          quantity: qty,
          shipping: {
            address: form.address,
            city: form.city,
            region: form.region,
            postal: form.postal,
            country: form.country,
          },
          notes: form.notes,
        }),
      });
      setStatus({ busy: false, ok: true, message: `Request ${data.order_number || ''} received. We will review availability before fulfillment.` });
    } catch (error) {
      setStatus({ busy: false, ok: false, message: error.message || 'International request could not be submitted.' });
    }
  }

  return <div className="app-shell international-page">
    <div className="trustbar"><div className="container trustbar-inner">
      <span><Icon name="shield" size={14}/> International order portal</span><span className="trustbar-sep">•</span>
      <span>Maximum 5 vials</span><span className="trustbar-sep">•</span>
      <span><Icon name="truck" size={15}/> $30 CAD flat delivery</span>
    </div></div>

    <header className="site-header"><div className="container nav-wrap">
      <a className="brand brand-logo-link" href="/" aria-label="Recon Water home"><img className="brand-logo" src="/assets/recon-water-logo.webp" alt="Recon Water" /></a>
      <nav className="desktop-nav" aria-label="Primary"><a href="/#product">Product</a><a href="/international/" aria-current="page">International</a></nav>
      <a className="cart-trigger" href="/" aria-label="Return to Canadian storefront cart"><Icon name="cart"/><span>Cart</span><b>0</b></a>
    </div></header>

    <main>
      <section className="international-section international-standalone"><div className="container international-grid">
        <div className="international-copy">
          <div className="eyebrow"><span/> International orders</div>
          <h1>International ordering.<br/><em>Simple and limited.</em></h1>
          <p>International orders are handled separately from Canadian orders. This page is restricted to loose 30 mL vials with fixed pricing and no volume discounts.</p>
          <div className="international-rules">
            <div><strong>$20 USD</strong><span>per vial</span></div>
            <div><strong>1–5</strong><span>vials maximum</span></div>
            <div><strong>$30 CAD</strong><span>flat delivery</span></div>
          </div>
          <div className="international-note"><Icon name="info" size={18}/><span>Canadian addresses must use the Canadian storefront. International availability is reviewed before fulfillment.</span></div>
          <a className="international-return-link" href="/"><Icon name="arrowLeft" size={16}/> Return to Canadian storefront</a>
        </div>

        <form className="international-card" onSubmit={submit}>
          <div className="international-card-head"><div><span>INTERNATIONAL REQUEST</span><h2>Bacteriostatic Water · 30 mL</h2></div><Icon name="truck" size={22}/></div>
          <div className="intl-qty-row"><div><span>Quantity</span><small>Maximum 5 vials</small></div><div className="intl-stepper"><button type="button" onClick={()=>setQty(q=>Math.max(1,q-1))} aria-label="Decrease international quantity">−</button><strong>{qty}</strong><button type="button" onClick={()=>setQty(q=>Math.min(5,q+1))} aria-label="Increase international quantity">+</button></div></div>
          <div className="intl-summary"><div><span>Product subtotal</span><strong>${money(productSubtotal)} USD</strong></div><div><span>Flat delivery</span><strong>$30.00 CAD</strong></div></div>
          <div className="intl-form-grid">
            <label><span>Name</span><input required minLength="2" maxLength="100" autoComplete="name" value={form.name} onChange={e=>patch('name',e.target.value)}/></label>
            <label><span>Email</span><input required type="email" autoComplete="email" value={form.email} onChange={e=>patch('email',e.target.value)}/></label>
            <label className="full"><span>Street address</span><input required minLength="5" autoComplete="street-address" value={form.address} onChange={e=>patch('address',e.target.value)}/></label>
            <label><span>City</span><input required minLength="2" autoComplete="address-level2" value={form.city} onChange={e=>patch('city',e.target.value)}/></label>
            <label><span>State / region</span><input required autoComplete="address-level1" value={form.region} onChange={e=>patch('region',e.target.value)}/></label>
            <label><span>Postal / ZIP code</span><input required autoComplete="postal-code" value={form.postal} onChange={e=>patch('postal',e.target.value)}/></label>
            <label><span>Country</span><input required autoComplete="country-name" placeholder="United States" value={form.country} onChange={e=>patch('country',e.target.value)}/></label>
            <label className="full"><span>Order note (optional)</span><textarea maxLength="500" value={form.notes} onChange={e=>patch('notes',e.target.value)}/></label>
          </div>
          {status.message&&<div className={`intl-status ${status.ok?'ok':'error'}`} role="status">{status.message}</div>}
          <button className="intl-submit" disabled={status.busy}>{status.busy?'Submitting…':`Submit international request · ${money(productSubtotal)} USD`}<Icon name="chevron" size={17}/></button>
          <p className="intl-disclaimer">No payment is collected through this form. Product subtotal is USD; delivery is a separate $30 CAD flat charge.</p>
        </form>
      </div></section>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<InternationalOrders/>);
