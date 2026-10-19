import React, {useEffect, useMemo, useRef, useState} from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, FileText, ImageIcon, Info, Minus, Plus, ShieldCheck, ShoppingBag, X, ZoomIn } from 'lucide-react';
import { configured, money } from './supabase';
import { RECON_PRODUCT_MEDIA } from './productMedia';
import { maxOrderable } from './productQuantity';

const GALLERY = [
  {id:'front',label:'Front view',short:'01',source:'front'},
  {id:'angle',label:'Angled view',short:'02',source:'angle'},
  {id:'detail',label:'Product details',short:'03',source:'detail'},
];
const clamp = (v,min,max)=>Math.min(max,Math.max(min,v));

function ProductArtwork({product,view,VialVisual,lightbox=false}) {
  const isPhoto=Boolean(view.src);
  const [badImage,setBadImage]=useState(false);
  useEffect(()=>setBadImage(false),[view.src]);
  if (isPhoto && !badImage) return <img className="rw-p2-product-image" src={view.src} loading={lightbox?'eager':'lazy'} decoding="async" fetchPriority={lightbox?'high':'low'} alt={`${product.name} — ${view.label}; photograph supplied by Recon Water`} onError={()=>setBadImage(true)}/>;
  if (view.id==='detail') return <div className="rw-p2-facts-art" aria-label="Product information illustration">
    <span className="rw-p2-facts-mark">RW / PRODUCT REFERENCE</span>
    <FileText size={46} strokeWidth={1.2}/>
    <strong>{product.volume_ml ? `${product.volume_ml} mL` : 'Product information'}</strong>
    <span>{product.sku}</span>
    <small>Illustrative specification sheet · not a packaging photo</small>
  </div>;
  return <div className={`rw-p2-art rw-p2-art-${view.id}`}>
    <VialVisual large/>
    <span className="rw-p2-art-note">CONCEPT VISUAL · NOT ACTUAL PACKAGING</span>
  </div>;
}

function QuantityControl({value,maximum,onChange}){
  return <div className="rw-p2-quantity" role="group" aria-label="Quantity">
    <button type="button" onClick={()=>onChange(Math.max(1,value-1))} disabled={value<=1 || maximum===0} aria-label="Decrease quantity"><Minus size={17}/></button>
    <output aria-label="Selected quantity">{value}</output>
    <button type="button" onClick={()=>onChange(Math.min(maximum,value+1))} disabled={maximum===0 || value>=maximum} aria-label="Increase quantity"><Plus size={17}/></button>
  </div>;
}

export default function ProductExperience({product,index,inCartQty,onAdd,VialVisual}){
  const [active,setActive]=useState(0);
  const [quantity,setQuantity]=useState(1);
  const [zoomOpen,setZoomOpen]=useState(false);
  const lightboxRef=useRef(null);
  const lightboxCloseRef=useRef(null);
  const isHospira30=product.volume_ml===30 && /bacteriostatic/i.test(product.name);
  const gallery=useMemo(()=>GALLERY.map(v=>({...v,src:isHospira30 ? RECON_PRODUCT_MEDIA[v.source] : ''})),[isHospira30]);
  const current=gallery[active];
  const remaining=maxOrderable(product.stock_quantity,inCartQty);
  const requested=clamp(quantity,1,Math.max(1,remaining));
  const hasPrice=Number.isInteger(product.price_cents) && product.price_cents>0;
  const hasStock=(product.stock_quantity||0)>0;
  const available=hasPrice && hasStock && remaining>0 && configured;
  const status = !hasStock ? 'Unavailable' : !hasPrice ? 'Pricing pending' : remaining===0 ? 'Limit in cart' : 'Available for request';
  const isLow = hasStock && (product.stock_quantity||0)<=product.low_stock_threshold;
  useEffect(()=>{setActive(0);setQuantity(1);setZoomOpen(false);},[product.id]);
  // The enlarged gallery behaves like a modal: restore focus, prevent background
  // scrolling on mobile, and keep keyboard users inside the dialog.
  useEffect(()=>{
    if(!zoomOpen)return;
    const previousFocus=document.activeElement;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    lightboxCloseRef.current?.focus();
    const onKey=e=>{
      if(e.key==='Escape'){e.preventDefault();setZoomOpen(false);return;}
      if(e.key==='ArrowRight')setActive(i=>(i+1)%gallery.length);
      if(e.key==='ArrowLeft')setActive(i=>(i+gallery.length-1)%gallery.length);
      if(e.key==='Tab'){
        const buttons=Array.from(lightboxRef.current?.querySelectorAll('button:not([disabled])')||[]);
        if(!buttons.length)return;
        const first=buttons[0],last=buttons[buttons.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',onKey);
    return()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow=previousOverflow;previousFocus?.focus?.();};
  },[zoomOpen,gallery.length]);
  return <article className="rw-p2-shell" aria-labelledby={`rw-p2-name-${product.id}`}>
    <div className="rw-p2-gallery">
      <div className="rw-p2-gallery-top"><span>RECON WATER / {String(index+1).padStart(2,'0')}</span><span>{product.volume_ml ? `${product.volume_ml} ML`:'PRODUCT'} · CAD</span></div>
      <button type="button" className="rw-p2-main-image" onClick={()=>setZoomOpen(true)} aria-label={`Enlarge ${current.label} of ${product.name}`}>
        <ProductArtwork product={product} view={current} VialVisual={VialVisual}/>
        <span className="rw-p2-zoom"><ZoomIn size={16}/> Enlarge view</span>
      </button>
      <div className="rw-p2-gallery-controls"><div className="rw-p2-thumbnails" role="group" aria-label="Product gallery">
        {gallery.map((view,i)=><button type="button" className={`rw-p2-thumb ${active===i?'is-selected':''}`} onClick={()=>setActive(i)} aria-pressed={active===i} aria-label={`Show ${view.label}`} key={view.id}>
          <span>{view.src ? <img src={view.src} alt="" loading="lazy" decoding="async" fetchPriority="low"/> : view.id==='detail' ? <FileText size={21}/> : <ImageIcon size={21}/>}</span><small>{view.label}</small>
        </button>)}
      </div><span className="rw-p2-view-counter">{String(active+1).padStart(2,'0')} / 03</span></div>
      <p className="rw-p2-photo-note"><Info size={14}/>{gallery.some(v=>v.src)?'Photos supplied by the operator; verify imagery against actual stock.':'Gallery contains concept artwork until verified product photographs are added.'}</p>
    </div>
    <div className="rw-p2-details">
      <div className="rw-p2-overline"><span className="rw-p2-brand">{isHospira30?'HOSPIRA · 30 ML':'PRODUCT INFORMATION'}</span><span className={`rw-p2-status ${hasStock&&hasPrice?'is-available':'is-pending'}`}><span/>{status}</span></div>
      <h3 id={`rw-p2-name-${product.id}`}>{product.name}</h3>
      <p className="rw-p2-description">{product.description || 'Product information is being reviewed. Please consult the listed product identification and request status.'}</p>
      <div className="rw-p2-specs"><div><span>VOLUME</span><strong>{product.volume_ml ? `${product.volume_ml} mL` : 'See listing'}</strong></div><div><span>PRODUCT SKU</span><strong>{product.sku}</strong></div><div><span>FORMAT</span><strong>{isHospira30?'Multi-dose vial':'See product details'}</strong></div></div>
      <div className="rw-p2-purchase">
        <div className="rw-p2-price-bar"><div><span>UNIT PRICE · CAD</span><strong className={hasPrice?'':'rw-p2-price-pending'}>{money(product.price_cents)}</strong><small>{hasPrice?'Price per vial. Taxes and delivery reviewed separately.':'The operator has not published a price.'}</small></div><div className="rw-p2-stock-text">{hasStock?<><Check size={16}/><span>{isLow?'Limited inventory':'Inventory available'}<small>Subject to request review</small></span></>:<><Info size={17}/><span>Currently unavailable<small>Check back for updates</small></span></>}</div></div>
        <div className="rw-p2-order-controls"><div className="rw-p2-stepper-wrap"><label>QUANTITY</label><QuantityControl value={requested} maximum={remaining} onChange={setQuantity}/></div><button type="button" className="rw-p2-add" disabled={!available} onClick={()=>onAdd(product,requested)}><ShoppingBag size={19}/>{available?'Add to request cart':!configured?'Setup required':'Currently unavailable'}<ArrowRight size={18}/></button></div>
        <div className="rw-p2-subtotal"><span>Estimated product subtotal</span><strong>{hasPrice?money(product.price_cents*requested):'—'}</strong></div>
        <p className="rw-p2-request-note"><ShieldCheck size={17}/> No online payment is collected. Submission starts a review; it does not confirm a sale or reserve inventory.</p>
      </div>
      <div className="rw-p2-info-list"><div><span><Check size={16}/> Prices in Canadian dollars</span><span><Check size={16}/> Ontario-based operation</span></div><div><span><Check size={16}/> Manual fulfillment review</span><span><Check size={16}/> Account request history</span></div></div>
      <a className="rw-p2-manufacturer" href="https://www.pfizermedicalinformation.com/bacteriostatic-water" target="_blank" rel="noreferrer noopener">Manufacturer product information <ArrowUpRight size={15}/></a>
    </div>
    {zoomOpen&&<div className="rw-p2-lightbox" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setZoomOpen(false);}}><div ref={lightboxRef} className="rw-p2-lightbox-panel" role="dialog" aria-modal="true" aria-label={`${current.label} enlarged`}>
      <div className="rw-p2-lightbox-header"><strong>{product.name}</strong><button ref={lightboxCloseRef} type="button" onClick={()=>setZoomOpen(false)} aria-label="Close enlarged view"><X size={21}/></button></div>
      <div className="rw-p2-lightbox-main"><button type="button" className="rw-p2-lightbox-arrow" onClick={()=>setActive(i=>(i+2)%3)} aria-label="Previous image"><ChevronLeft size={22}/></button><div className="rw-p2-lightbox-art"><ProductArtwork product={product} view={current} VialVisual={VialVisual} lightbox/></div><button type="button" className="rw-p2-lightbox-arrow" onClick={()=>setActive(i=>(i+1)%3)} aria-label="Next image"><ChevronRight size={22}/></button></div>
      <span>{current.label} · {active+1} of 3</span>
    </div></div>}
  </article>;
}
