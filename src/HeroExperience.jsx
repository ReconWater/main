import React, { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Droplet, MapPin, Minus, PackageCheck, Plus, ShieldCheck, ShoppingBag } from 'lucide-react';
import { RECON_PRODUCT_MEDIA } from './productMedia';
import { money } from './supabase';
import { formatAvailability, isRequestable } from './packaging';
import './hero.css';

/**
 * Restored from the repository's existing single-product HeroExperience.
 * This version accepts V5 package records, keeping live pricing and inventory
 * authoritative and sharing the same selected format and cart as App.jsx.
 */
export default function HeroExperience({ product, packages = [], stock, selected, onSelect, quantity, onQuantity, cart, onAdd, onExplore }) {
  const [imageFailed, setImageFailed] = useState(false);
  const chosen = packages.find(p => p.id === selected) || packages[0];
  const { remaining = 0 } = formatAvailability(chosen, cart, stock);
  const requested = Math.min(Math.max(1, quantity), Math.max(1, remaining));
  const available = isRequestable(chosen, { remaining });
  const photoAvailable = Boolean(RECON_PRODUCT_MEDIA.front && !imageFailed);
  const status = !product ? 'Product information pending'
    : !chosen ? 'Pricing is being configured'
    : !chosen.active ? 'Requests currently disabled'
    : !chosen.price_cents ? 'Price pending'
    : !Number(chosen.available_packages) ? 'Currently unavailable'
    : !remaining ? 'Request limit reached'
    : 'Available for review';
  useEffect(() => { setImageFailed(false); }, [product?.id]);

  return <section className="rw-bac-hero" id="product" aria-labelledby="rw-bac-title">
    <div className="rw-bac-background" aria-hidden="true"/>
    <div className="rw-bac-sheen" aria-hidden="true"/>
    <div className="container rw-bac-layout">
      <div className="rw-bac-copy">
        <span className="rw-bac-eyebrow"><span className="rw-bac-eyebrow-line"/> RECON WATER / ONTARIO, CANADA</span>
        <span className="rw-bac-edition"><Droplet size={15} aria-hidden="true"/> HOSPIRA · 30 ML MULTI-DOSE VIAL</span>
        <h1 id="rw-bac-title">Bacteriostatic<br/><em>Water.</em></h1>
        <p className="rw-bac-subtitle">Bacteriostatic Water for Injection USP. <strong>30 mL.</strong></p>
        <p className="rw-bac-intro">One product, three available packaging formats. Select an individual vial, a ten-vial bundle, or a factory-sealed case of 25.</p>
        <div className="rw-bac-actions"><button className="rw-bac-primary" type="button" onClick={onExplore}>Product specifications <ArrowUpRight size={18} aria-hidden="true"/></button></div>
        <div className="rw-bac-proofs" aria-label="Site information">
          <span><MapPin size={16} aria-hidden="true"/> Ontario based</span>
          <span><ShieldCheck size={16} aria-hidden="true"/> Individual request review</span>
          <span><PackageCheck size={16} aria-hidden="true"/> Lot-managed availability</span>
        </div>
      </div>
      <div className="rw-bac-card" aria-label="Hospira 30 mL product and packaging request">
        <div className="rw-bac-card-visual">
          {photoAvailable ? <img src={RECON_PRODUCT_MEDIA.front} alt="Hospira 30 mL bacteriostatic water vial — operator-supplied photograph" decoding="async" loading="eager" fetchPriority="high" onError={() => setImageFailed(true)}/>
           : <div className="rw-bac-water-mark" role="img" aria-label="30 millilitre format illustration, not the actual package"><span>30</span><small>mL</small></div>}
        </div>
        <div className="rw-bac-card-identity">
          <span>HOSPIRA / PFIZER · DIN 00038202 — VERIFY LABEL</span>
          <strong>Bacteriostatic Water</strong>
          <small>For Injection USP · One product / three purchasing formats</small>
        </div>
        <div className="rw-bac-purchase">
          <div className="rw-bac-package-header"><span>SELECT PACKAGING</span><small>CAD / PACKAGE</small></div>
          <div className="rw-bac-packages" role="radiogroup" aria-label="Choose the package format">
            {packages.length ? packages.map(p => <button key={p.id} type="button" role="radio" aria-checked={chosen?.id === p.id} className={`rw-bac-package ${chosen?.id === p.id ? 'is-selected' : ''}`} onClick={() => onSelect(p.id)}>
              <span className="rw-bac-package-name">{p.code === 'single' ? 'Single vial' : p.code === 'ten' ? '10-vial bundle' : 'Factory-sealed case'}</span>
              <strong>{p.vials_per_pack} <small>{p.vials_per_pack === 1 ? 'vial' : 'vials'}</small></strong>
              <span className="rw-bac-package-price">{p.price_cents ? money(p.price_cents) : 'Price pending'}</span>
              {chosen?.id === p.id && <Check className="rw-bac-package-check" size={13} aria-hidden="true"/>}
            </button>) : <p className="rw-bac-no-packages">Packaging options are being configured.</p>}
          </div>
          {chosen && <>
            <div className="rw-bac-purchase-top">
              <div className="rw-bac-price"><span>SELECTED FORMAT · CAD</span><strong>{chosen.price_cents ? money(chosen.price_cents) : 'Price pending'}</strong><small>{chosen.vials_per_pack} × 30 mL · {chosen.stock_kind === 'sealed' ? 'Factory-sealed inventory' : 'Loose-vial inventory'}</small></div>
              <div className={`rw-bac-stock ${available ? 'is-available' : 'is-unavailable'}`} role="status"><span className="rw-bac-stock-dot"/>{status}</div>
            </div>
            <div className="rw-bac-order-row">
              <div className="rw-bac-qty" role="group" aria-label="Number of selected packages">
                <button type="button" aria-label="Decrease package quantity" disabled={!available || requested <= 1} onClick={() => onQuantity(Math.max(1, requested - 1))}><Minus size={16}/></button>
                <output aria-label="Selected packages">{requested}</output>
                <button type="button" aria-label="Increase package quantity" disabled={!available || requested >= remaining} onClick={() => onQuantity(Math.min(remaining, requested + 1))}><Plus size={16}/></button>
              </div>
              <button className="rw-bac-add" type="button" disabled={!available} onClick={() => onAdd(chosen, requested)}><ShoppingBag size={18} aria-hidden="true"/> Add to request <ArrowRight size={16} aria-hidden="true"/></button>
            </div>
            <p className="rw-bac-request-note"><ShieldCheck size={15} aria-hidden="true"/> No payment collected. Submitted requests do not reserve stock; all requests require review.</p>
          </>}
        </div>
      </div>
    </div>
    <div className="container rw-bac-foot"><span>RECON WATER · INDEPENDENT ONTARIO WEBSITE</span><button type="button" onClick={onExplore}>SPECIFICATIONS <ArrowRight size={15} aria-hidden="true"/></button></div>
  </section>;
}
