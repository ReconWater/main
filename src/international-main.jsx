import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './international-page.css';
import './international-payments.css';
import SiteHeader from './SiteHeader';

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
  const [referralInput, setReferralInput] = useState('');
  const [referral, setReferral] = useState(null);
  const [referralStatus, setReferralStatus] = useState({ busy: false, message: '', error: false });
  const [status, setStatus] = useState({ busy: false, message: '', ok: false });

  const productSubtotal = qty * 20;
  const patch = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    if (key === 'email' && referral) { setReferral(null); setReferralStatus({ busy: false, message: 'Reapply the referral code after changing your email.', error: false }); }
  };

  async function applyReferral() {
    if (!referralInput.trim()) return;
    if (!form.email.trim()) { setReferralStatus({ busy: false, message: 'Enter your email before applying a referral code.', error: true }); return; }
    setReferralStatus({ busy: true, message: '', error: false });
    try {
      const result = await apiRequest('referral-validate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purpose: 'attribution', code: referralInput, email: form.email }) });
      setReferral(result);setReferralInput(result.code);setReferralStatus({ busy: false, message: 'Referral recognized. Your referrer earns a reward after fulfillment.', error: false });
    } catch (error) {
      setReferral(null);setReferralStatus({ busy: false, message: error.message || 'Referral code could not be applied.', error: true });
    }
  }

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
          referral_code: referral?.code || null,
        }),
      });
      setStatus({ busy: false, ok: true, message: `Request ${data.order_number || ''} received. USDC payment is requested only after the order is reviewed and approved.` });
    } catch (error) {
      setStatus({ busy: false, ok: false, message: error.message || 'International request could not be submitted.' });
    }
  }

  return <div className="app-shell international-page">
    <div className="trustbar"><div className="container trustbar-inner">
      <span><Icon name="shield" size={14}/> International order portal</span><span className="trustbar-sep">•</span>
      <span>Maximum 5 vials</span><span className="trustbar-sep">•</span>
      <span><Icon name="truck" size={15}/> Shipping quoted separately</span>
    </div></div>

    <SiteHeader active="international" cartCount={0} cartHref="/" />

    <main>
      <section className="international-section international-standalone"><div className="container international-grid">
        <div className="international-copy">
          <div className="eyebrow"><span/> International orders</div>
          <h1>International ordering.<br/><em>Simple and limited.</em></h1>
          <p>International orders are handled separately from Canadian orders. This page is restricted to loose 30 mL vials with fixed pricing and no volume discounts.</p>
          <div className="international-rules">
            <div><strong>$20 USD</strong><span>per vial</span></div>
            <div><strong>1–5</strong><span>vials maximum</span></div>
            <div><strong>Pending</strong><span>shipping carrier</span></div>
          </div>
          <div className="international-note"><Icon name="info" size={18}/><span>Canadian addresses must use the Canadian storefront. International availability is reviewed before fulfillment. Do not send crypto before receiving order-specific payment instructions.</span></div>
          <a className="international-return-link" href="/"><Icon name="arrowLeft" size={16}/> Return to Canadian storefront</a>
        </div>

        <form className="international-card" onSubmit={submit}>
          <div className="international-card-head"><div><span>INTERNATIONAL REQUEST</span><h2>Bacteriostatic Water · 30 mL</h2></div><Icon name="truck" size={22}/></div>
          <div className="intl-qty-row"><div><span>Quantity</span><small>Maximum 5 vials</small></div><div className="intl-stepper"><button type="button" onClick={()=>setQty(q=>Math.max(1,q-1))} aria-label="Decrease international quantity">−</button><strong>{qty}</strong><button type="button" onClick={()=>setQty(q=>Math.min(5,q+1))} aria-label="Increase international quantity">+</button></div></div>
          <div className="intl-summary"><div><span>Product subtotal</span><strong>${money(productSubtotal)} USD</strong></div><div><span>Shipping</span><strong>Not yet quoted</strong></div><div className="intl-total-row"><span>Final total</span><strong>Pending shipping</strong></div></div><div className="intl-payment-rail"><div><span>PAYMENT METHOD</span><strong>USDC · Ethereum</strong></div><p>Payment is requested only after review. Send USDC on Ethereum mainnet (ERC-20) only; the wallet address and exact amount are provided with the approved order.</p></div>
          <div className="intl-referral-box">
            <div className="intl-referral-copy"><span>REFERRED BY SOMEONE?</span><p>Enter their referral code. International pricing does not change; the referrer receives a one-time 5% Canadian-store reward code after your order is fulfilled.</p></div>
            <div className="intl-referral-control">
              <input value={referralInput} onChange={e=>setReferralInput(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();applyReferral();}}} placeholder="Referral code" maxLength="32" aria-label="Referral code"/>
              <button type="button" onClick={applyReferral} disabled={referralStatus.busy||!referralInput.trim()}>{referralStatus.busy?'Checking…':referral?'Applied':'Apply'}</button>
            </div>
            {referralStatus.message&&<small className={referralStatus.error?'error':'ok'}>{referralStatus.message}</small>}
          </div>
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
          <button className="intl-submit" disabled title="International automated shipping is not yet configured">International checkout temporarily unavailable</button>
          <p className="intl-disclaimer">The previous flat delivery charge has been removed. International checkout will reopen when a compatible live-rate carrier is connected.</p>
        </form>
      </div></section>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<InternationalOrders/>);
