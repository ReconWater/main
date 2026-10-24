import React, {useEffect, useRef, useState} from 'react';
import {ChevronLeft, ChevronRight, Droplet, Maximize2, X} from 'lucide-react';
import {RECON_PRODUCT_MEDIA} from './productMedia';
import './clinical-gallery.css';

const PHOTO_VIEWS = [
  {id:'front',label:'Front label',src:RECON_PRODUCT_MEDIA.front},
  {id:'angle',label:'Angled vial',src:RECON_PRODUCT_MEDIA.angle},
  {id:'detail',label:'Label details',src:RECON_PRODUCT_MEDIA.detail}
];

export default function ClinicalGallery(){
 const pictures=PHOTO_VIEWS.filter(photo=>Boolean(photo.src));
 const [active,setActive]=useState(0),[failed,setFailed]=useState([]),[open,setOpen]=useState(false);
 const closeRef=useRef(null),modalRef=useRef(null);
 const available=pictures.filter(p=>!failed.includes(p.id));
 const photo=available[Math.min(active,Math.max(0,available.length-1))];
 const advance=offset=>setActive(i=>(i+offset+available.length)%available.length);
 useEffect(()=>{if(!open)return;const former=document.activeElement;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';closeRef.current?.focus();
  const key=e=>{if(e.key==='Escape'){e.preventDefault();setOpen(false)}
    if(e.key==='ArrowRight'&&available.length>1){e.preventDefault();advance(1)}
    if(e.key==='ArrowLeft'&&available.length>1){e.preventDefault();advance(-1)}
    if(e.key==='Tab'){const controls=[...modalRef.current.querySelectorAll('button:not([disabled])')];const first=controls[0],last=controls.at(-1);
       if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}
  };document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;former?.focus?.()};
 },[open,available.length]);
 return <section className="clinical-gallery" aria-label="Product presentation">
  <div className="clinical-gallery-head"><span>01 / HOSPIRA WATER</span><span>30 mL</span></div>
  <div className={`clinical-gallery-stage ${photo?'has-photo':'no-photo'}`}>
   {photo ? <button type="button" className="clinical-gallery-photo" aria-label={`Enlarge ${photo.label} photograph`} onClick={()=>setOpen(true)}>
     <img src={photo.src} alt={`Hospira Bacteriostatic Water 30 mL — ${photo.label}. Verify against actual stock.`} fetchPriority="high" loading="eager" decoding="async" onError={()=>{setFailed(a=>[...a,photo.id]);setActive(0)}}/>
     <span className="clinical-zoom"><Maximize2 size={16}/> Enlarge photograph</span></button>
   : <div className="clinical-no-photo" aria-label="Product photo pending verification">
      <div className="clinical-no-photo-symbol"><Droplet size={53} strokeWidth={1.1}/></div>
      <span className="clinical-art-tag">30<span>mL</span></span>
      <strong>Hospira Bacteriostatic Water</strong>
      <div className="clinical-placeholder-disclosure">Product photograph pending — not product packaging</div>
     </div>}
  </div>
  {available.length>1 ? <div className="clinical-gallery-thumbs" role="group" aria-label="Product views">{available.map((p,i)=><button key={p.id} type="button" className={photo?.id===p.id?'is-active':''} aria-pressed={photo?.id===p.id} onClick={()=>setActive(i)}><img src={p.src} alt="" loading="lazy"/><span>{p.label}</span></button>)}</div>
   : null}
  {open&&photo&&<div className="clinical-lightbox" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&setOpen(false)}><section ref={modalRef} className="clinical-lightbox-panel" role="dialog" aria-modal="true" aria-label="Enlarged product photograph"><div className="clinical-lightbox-top"><span>{photo.label}</span><button ref={closeRef} type="button" onClick={()=>setOpen(false)} aria-label="Close photograph"><X size={22}/></button></div><img src={photo.src} alt={`Enlarged ${photo.label} photograph of Hospira 30 mL vial`}/>{available.length>1&&<div className="clinical-lightbox-controls"><button type="button" onClick={()=>advance(-1)} aria-label="Previous photo"><ChevronLeft/></button><span>{active+1} / {available.length}</span><button type="button" onClick={()=>advance(1)} aria-label="Next photo"><ChevronRight/></button></div>}</section></div>}
 </section>;
}
