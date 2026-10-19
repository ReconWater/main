import React, { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Droplet, MapPin, Minus, Plus, ShieldCheck, ShoppingBag } from 'lucide-react';
import { RECON_PRODUCT_MEDIA } from './productMedia';
import { configured, money } from './supabase';
import { maxOrderable } from './productQuantity';
import './hero.css';

/**
 * A single-product hero for Hospira Bacteriostatic Water for Injection USP, 30 mL.
 * Pricing and availability are passed in from the same Supabase product record as
 * the product detail section. The add action is the existing cart handler.
 * No generated/fictional manufacturer packaging is displayed.
 */
export default function HeroExperience({ product, inCartQty = 0, onAdd, onExplore, onProcess }) {
  const [quantity, setQuantity] = useState(1);
  const [imageFailed, setImageFailed] = useState(false);

  const hasPrice = Number.isInteger(product?.price_cents) && product.price_cents > 0;
  const stock = Math.max(0, Number(product?.stock_quantity) || 0);
  const remaining = product ? maxOrderable(stock, inCartQty) : 0;
  const available = Boolean(configured && product && hasPrice && remaining > 0);
  const chosen = Math.min(Math.max(1, quantity), Math.max(1, remaining));
  const photoAvailable = Boolean(RECON_PRODUCT_MEDIA.front && !imageFailed);

  useEffect(() => { setQuantity(1); setImageFailed(false); }, [product?.id]);

  let status = 'Product not published';
  if (!configured) status = 'Preview mode';
  else if (product && stock === 0) status = 'Currently unavailable';
  else if (product && !hasPrice) status = 'Pricing pending';
  else if (product && remaining === 0) status = 'Request limit reached';
  else if (available) status = 'Available for request';

  const addToRequest = () => {
    if (available) onAdd(product, chosen);
  };

  return (
    <section className="rw-bac-hero" aria-labelledby="rw-bac-title">
      <div className="rw-bac-background" aria-hidden="true" />
      <div className="rw-bac-sheen" aria-hidden="true" />
      <div className="container rw-bac-layout">
        <div className="rw-bac-copy">
          <span className="rw-bac-eyebrow"><span className="rw-bac-eyebrow-line" /> THE PRODUCT · ONTARIO, CANADA</span>
          <span className="rw-bac-edition"><Droplet size={15} aria-hidden="true" /> HOSPIRA / 30 ML MULTI-DOSE VIAL</span>
          <h1 id="rw-bac-title">Bacteriostatic<br/><em>Water.</em></h1>
          <p className="rw-bac-subtitle">Hospira Bacteriostatic Water for Injection USP. <strong>30 mL.</strong></p>
          <p className="rw-bac-intro">One product, clearly presented. Explore the product details, see published Canadian pricing, and submit a request for individual review.</p>
          <div className="rw-bac-actions">
            <button className="rw-bac-primary" type="button" onClick={onExplore}>Explore the product <ArrowUpRight size={18} aria-hidden="true" /></button>
            <button className="rw-bac-secondary" type="button" onClick={onProcess}>How requests work <ArrowRight size={17} aria-hidden="true" /></button>
          </div>
          <div className="rw-bac-proofs" aria-label="Site information">
            <span><MapPin size={16} aria-hidden="true" /> Ontario based</span>
            <span><ShieldCheck size={16} aria-hidden="true" /> Individual request review</span>
          </div>
        </div>

        <div className="rw-bac-card" aria-label="Hospira 30 mL product and request information">
          <div className="rw-bac-card-header">
            <span>SINGLE PRODUCT / 30 ML</span>
            <span className="rw-bac-card-symbol"><Droplet size={18} aria-hidden="true" /></span>
          </div>
          <div className="rw-bac-card-visual">
            {photoAvailable ? (
              <img src={RECON_PRODUCT_MEDIA.front} alt="Hospira 30 mL bacteriostatic water vial photographed by Recon Water" decoding="async" loading="eager" fetchPriority="high" onError={() => setImageFailed(true)} />
            ) : (
              <div className="rw-bac-water-mark" role="img" aria-label="30 mL presentation; typography, not a photograph of the product">
                <span>30</span><small>mL</small>
              </div>
            )}
          </div>
          <div className="rw-bac-card-identity">
            <span>HOSPIRA · FOR INJECTION USP</span>
            <strong>Bacteriostatic Water</strong>
            <small>30 mL multi-dose vial</small>
          </div>
          <div className="rw-bac-purchase">
            <div className="rw-bac-purchase-top">
              <div className="rw-bac-price"><span>PRICE PER VIAL · CAD</span><strong>{hasPrice ? money(product.price_cents) : 'Price pending'}</strong></div>
              <div className={`rw-bac-stock ${available ? 'is-available' : 'is-unavailable'}`} role="status"><span className="rw-bac-stock-dot" />{status}</div>
            </div>
            <div className="rw-bac-order-row">
              <div className="rw-bac-qty" role="group" aria-label="Request quantity">
                <button type="button" aria-label="Decrease quantity" disabled={!available || chosen <= 1} onClick={() => setQuantity(Math.max(1, chosen - 1))}><Minus size={16}/></button>
                <output aria-label="Selected quantity">{chosen}</output>
                <button type="button" aria-label="Increase quantity" disabled={!available || chosen >= remaining} onClick={() => setQuantity(Math.min(remaining, chosen + 1))}><Plus size={16}/></button>
              </div>
              <button className="rw-bac-add" type="button" disabled={!available} onClick={addToRequest}><ShoppingBag size={18} aria-hidden="true" /> Add to request <ArrowRight size={16} aria-hidden="true" /></button>
            </div>
            <p className="rw-bac-request-note"><Check size={15} aria-hidden="true" /> No payment collected online. Requests require approval.</p>
          </div>
          {!photoAvailable && <span className="rw-bac-photo-note">Typographic representation · not manufacturer packaging</span>}
        </div>
      </div>
      <div className="container rw-bac-foot"><span>RECON WATER · INDEPENDENT CANADIAN WEBSITE</span><button type="button" onClick={onExplore}>PRODUCT DETAILS <ArrowRight size={15} aria-hidden="true" /></button></div>
    </section>
  );
}
