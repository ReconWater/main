import React, { useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Droplet, ShieldCheck, MapPin, ClipboardCheck } from 'lucide-react';
import { RECON_PRODUCT_MEDIA } from './productMedia';
import './hero.css';

const details = [
  { label: '30 mL', title: '30 mL multi-dose vial', description: 'The featured presentation of Hospira Bacteriostatic Water for Injection USP.' },
  { label: 'Product', title: 'Bacteriostatic water', description: 'Refer to the verified manufacturer labeling and product information for specifications and directions.' },
  { label: 'Requests', title: 'Individually reviewed', description: 'Availability and eligibility are reviewed before confirmation. No payment is collected on this site.' },
];

/** Decorative hero background contains NO package render, text or product claims.
 * Show a product image only when an actual, verified photograph is configured.
 * Interactive tabs are standard React state, accessible to keyboard and screen readers.
 */
export default function HeroExperience({ onExplore, onProcess }) {
  const [selected, setSelected] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const productPhoto = RECON_PRODUCT_MEDIA.front && !imageFailed;
  const active = details[selected];
  return (
    <section className="rw-bac-hero" aria-labelledby="rw-bac-title">
      <div className="rw-bac-background" aria-hidden="true" />
      <div className="rw-bac-sheen" aria-hidden="true" />
      <div className="container rw-bac-layout">
        <div className="rw-bac-copy">
          <span className="rw-bac-eyebrow"><span className="rw-bac-eyebrow-line"/> RECON WATER · ONTARIO, CANADA</span>
          <h1 id="rw-bac-title"><span>Hospira</span><br/>Bacteriostatic<br/><em>Water.</em></h1>
          <p className="rw-bac-subtitle">Bacteriostatic Water for Injection USP<br className="rw-bac-desktop-break"/> <strong>30 mL multi-dose vial</strong></p>
          <p className="rw-bac-intro">A dedicated product information and request experience, based in Ontario.</p>
          <div className="rw-bac-actions">
            <button className="rw-bac-primary" type="button" onClick={onExplore}>View product details <ArrowUpRight size={18}/></button>
            <button className="rw-bac-secondary" type="button" onClick={onProcess}>How requests work <ArrowRight size={18}/></button>
          </div>
          <div className="rw-bac-proofs" aria-label="Business and order information">
            <span><MapPin size={16}/> Ontario based</span>
            <span><ShieldCheck size={16}/> Reviewed requests</span>
            <span><Droplet size={16}/> 30 mL focus</span>
          </div>
        </div>
        <div className="rw-bac-card" aria-label="Hospira bacteriostatic water product highlights">
          <div className="rw-bac-card-header"><span>PRODUCT NO. 01</span><span className="rw-bac-card-symbol"><Droplet size={19}/></span></div>
          <div className="rw-bac-card-visual">
            {productPhoto ? <img src={RECON_PRODUCT_MEDIA.front} alt="Actual Hospira 30 mL bacteriostatic water product photograph" decoding="async" loading="eager" fetchPriority="high" onError={()=>setImageFailed(true)}/> : <div className="rw-bac-water-mark" aria-label="30 millilitre presentation; decorative depiction, not product packaging"><span>30</span><small>mL</small></div>}
          </div>
          <div className="rw-bac-card-identity">
            <span>HOSPIRA · PRODUCT INFORMATION</span>
            <strong>Bacteriostatic Water<br/>for Injection USP</strong>
          </div>
          <div className="rw-bac-tabs" role="tablist" aria-label="Product highlights">
            {details.map((detail,index)=><button key={detail.label} id={`rw-bac-tab-${index}`} role="tab" type="button" aria-selected={selected===index} aria-controls="rw-bac-panel" tabIndex={selected===index?0:-1} className={selected===index?'is-selected':''} onClick={()=>setSelected(index)} onKeyDown={event=>{ if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault(); const next=(selected+(event.key==='ArrowRight'?1:-1)+details.length)%details.length; setSelected(next); document.getElementById(`rw-bac-tab-${next}`)?.focus(); } }}>{detail.label}</button>)}
          </div>
          <div className="rw-bac-tab-panel" id="rw-bac-panel" role="tabpanel" aria-labelledby={`rw-bac-tab-${selected}`} tabIndex={0}>
            <strong>{active.title}</strong><p>{active.description}</p>
          </div>
          {!productPhoto && <span className="rw-bac-photo-note">Illustrative design · no simulated manufacturer packaging</span>}
        </div>
      </div>
      <div className="container rw-bac-foot"><span>ONE PRODUCT. EVERY DETAIL.</span><button type="button" onClick={onExplore}>EXPLORE <ArrowDownRight size={16}/></button></div>
    </section>
  );
}
