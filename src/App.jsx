import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Box, Check, CheckCircle2, ChevronDown, ClipboardList, CreditCard, Droplets, FileText, HeartPulse, LockKeyhole, LogIn, LogOut, Menu, Minus, Package, PackageCheck, Plus, Search, ShieldCheck, ShoppingBag, Sparkles, Truck, UserRound, X, AlertCircle } from 'lucide-react';
import { supabase, configured, callApi, money } from './supabase';
import { CANADIAN_PROVINCES, formatCanadianPostal } from './canada';
import ProductExperience from './ProductExperience';
import HeroExperience from './HeroExperience';

// Explicit route boundary: administration and its CSS are not part of the storefront entry bundle.
const AdminPanel = React.lazy(() => import('./AdminPanel.jsx'));
import { maxOrderable, nextCartQuantity, MAX_REQUEST_UNITS } from './productQuantity';

const scrollToSection = (id, delay=0) => {
  const scroll = () => document.getElementById(id)?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start'
  });
  if (delay) window.setTimeout(scroll, delay);
  else scroll();
};

const previewProducts = [{ id:'preview',sku:'BW-30ML',name:'Bacteriostatic Water for Injection USP',description:'30 mL multiple-dose vial. Availability and eligibility subject to review.',volume_ml:30,price_cents:null,stock_quantity:0,low_stock_threshold:5,is_active:true }];
const statusLabel = { pending_review:'Pending review', approved:'Approved', fulfilled:'Fulfilled', cancelled:'Cancelled' };
const date = (d) => new Date(d).toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'});
function VialVisual({large=false}) {
  return <div className={`vial-art ${large?'vial-art-large':''}`} aria-label="Generic illustration of a bacteriostatic water vial" role="img">
    <div className="vial-halo"/><div className="vial-shadow"/><div className="vial"><div className="vial-cap"><div className="vial-cap-top"/></div><div className="vial-neck"/><div className="vial-glass"><div className="vial-glint"/><div className="vial-label"><span className="vial-label-top">STERILE PREPARATION</span><strong>BACTERIOSTATIC<br/>WATER</strong><span>FOR INJECTION · USP</span><span className="vial-ml">30 mL</span></div><div className="vial-liquid"/></div></div>
    <span className="art-deco art-deco-a"/><span className="art-deco art-deco-b"/>
  </div>;
}
function BrandWordmark({ inverse = false }) {
  return <span className={`rw-brand ${inverse ? 'rw-brand-inverse' : ''}`}>
    <span className="rw-brand-symbol" aria-hidden="true"><Droplets size={23} strokeWidth={1.7}/></span>
    <span className="rw-brand-type"><strong>recon<span>water</span><span className="rw-brand-period">.</span></strong><small>ONTARIO · CANADA</small></span>
  </span>;
}

function SiteHeader({route, navigate, mobileOpen, setMobileOpen, session, loadOrders, setOrdersOpen, setAuthOpen, setCartOpen, totalCount}) {
  const goToSection = (id) => {
    if (route !== 'shop') navigate('shop');
    else setMobileOpen(false);
    scrollToSection(id, route === 'shop' ? 0 : 75);
  };
  return <>
    <div className="rw-topbar"><div className="container rw-topbar-inner">
      <span><span className="rw-topbar-dot"/> INDEPENDENT · ONTARIO BASED</span>
      <span>PRODUCT INFORMATION &amp; REQUEST REVIEW <ArrowUpRight size={13}/></span>
    </div></div>
    <header className="rw-header"><div className="container rw-header-inner">
      <button type="button" className="rw-home" onClick={()=>navigate('shop')} aria-label="Recon Water homepage"><BrandWordmark/></button>
      <nav id="rw-navigation" className={`rw-navigation ${mobileOpen ? 'rw-navigation-open' : ''}`} aria-label="Primary navigation">
        <button type="button" className={route==='shop'?'rw-nav-active':''} onClick={()=>goToSection('products')}>The product</button>
        <button type="button" onClick={()=>goToSection('about')}>Our approach</button>
        <button type="button" onClick={()=>goToSection('how')}>How it works</button>
      </nav>
      <div className="rw-header-actions">
        {session
          ? <button className="rw-account" type="button" onClick={()=>{loadOrders();setOrdersOpen(true);}}><UserRound size={17}/><span>My requests</span></button>
          : <button className="rw-account" type="button" onClick={()=>setAuthOpen(true)}><UserRound size={17}/><span>Sign in</span></button>}
        <button className="rw-cart" type="button" aria-label={`Open cart${totalCount ? `, ${totalCount} items` : ''}`} onClick={()=>setCartOpen(true)}><ShoppingBag size={18}/>{totalCount>0&&<em>{totalCount}</em>}</button>
        <button type="button" className="rw-menu-button" aria-controls="rw-navigation" aria-expanded={mobileOpen} aria-label={mobileOpen?'Close navigation':'Open navigation'} onClick={()=>setMobileOpen(!mobileOpen)}>{mobileOpen?<X size={21}/>:<Menu size={21}/>}</button>
      </div>
    </div></header>
  </>;
}

function BrandAbout() {
  return <section id="about" className="rw-about-section" aria-labelledby="rw-about-title"><div className="container rw-about-inner">
    <div className="rw-about-number">RW / 001</div>
    <div className="rw-about-copy"><div className="rw-kicker">THE RECON WATER APPROACH</div><h2 id="rw-about-title">Focused on what <em>matters.</em></h2><p>One place for essential product information, transparent request status, and a carefully organized customer experience. Our process is designed around clarity at each step.</p></div>
    <div className="rw-about-aside"><span>01 — INFORMATION</span><span>02 — AVAILABILITY</span><span>03 — REVIEW</span></div>
  </div></section>;
}

function SiteFooter({navigate}) {
  return <footer className="rw-footer"><div className="container rw-footer-inner">
    <div className="rw-footer-intro"><BrandWordmark inverse/><p>Clarity in every detail. An independent product information and request portal based in Ontario, Canada.</p></div>
    <div className="rw-footer-col"><h3>Explore</h3><button onClick={()=>{navigate('shop');scrollToSection('products',75);}}>Product information <ArrowUpRight size={13}/></button><button onClick={()=>{navigate('shop');scrollToSection('how',75);}}>How it works <ArrowUpRight size={13}/></button><button onClick={()=>navigate('admin')}>Administration <ArrowUpRight size={13}/></button></div>
    <div className="rw-footer-col"><h3>Product context</h3><p>CAD pricing, Canadian addresses, and individual request review. No online payment is collected through this site.</p><a href="https://www.pfizermedicalinformation.com/bacteriostatic-water" target="_blank" rel="noopener noreferrer">Manufacturer information <ArrowUpRight size={13}/></a></div>
  </div><div className="container rw-footer-bottom"><span>© {new Date().getFullYear()} Recon Water. Ontario, Canada.</span><span>Independent site · Not affiliated with or endorsed by Hospira or Pfizer.</span></div></footer>;
}

function Notice({message,onClose}) { return message ? <div className={`toast ${message.type==='error'?'toast-error':''}`} role="status"><span>{message.type==='error'?<AlertCircle size={19}/>:<CheckCircle2 size={19}/>}</span><span>{message.text}</span><button className="icon-button" aria-label="Dismiss notice" onClick={onClose}><X size={16}/></button></div> : null; }
function Field({label,children,hint}) { return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>; }
function Pill({children,type='neutral'}) {return <span className={`pill pill-${type}`}>{children}</span>;}
function SimpleIcon({kind}) {return kind==='delivery'?<Truck size={23}/>:kind==='verified'?<ShieldCheck size={23}/>:<PackageCheck size={23}/>;}

export default function App(){
  const [route,setRoute] = useState(window.location.pathname.startsWith('/admin')?'admin':'shop');
  const [products,setProducts]=useState(configured?[]:previewProducts);
  const [session,setSession]=useState(null);
  const [authOpen,setAuthOpen]=useState(false);
  const [cartOpen,setCartOpen]=useState(false);
  const [checkoutOpen,setCheckoutOpen]=useState(false);
  const [notice,setNotice]=useState(null);
  const [cart,setCart]=useState({});
  const [loading,setLoading]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [myOrders,setMyOrders]=useState([]);
  const [ordersOpen,setOrdersOpen]=useState(false);
  const toast = (text,type='success')=>setNotice({text,type});
  const navigate = (to)=>{ const url=to==='admin'?'/admin':'/'; window.history.pushState({},'',url); setRoute(to);setMobileOpen(false);window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}); };
  useEffect(()=>{const change=()=>setRoute(window.location.pathname.startsWith('/admin')?'admin':'shop');window.addEventListener('popstate',change);return()=>window.removeEventListener('popstate',change);},[]);
  useEffect(()=>{
    if (!mobileOpen) return;
    const onKey = event => { if (event.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  },[mobileOpen]);
  const loadProducts=useCallback(async()=>{
    if(!supabase) return;
    const {data,error}=await supabase.from('products').select('id,sku,name,description,volume_ml,price_cents,stock_quantity,low_stock_threshold,is_active').eq('is_active',true).order('name');
    if(error) toast('Cannot retrieve products. Check Supabase setup.','error');
    else setProducts(data||[]);
  },[]);
  useEffect(()=>{loadProducts();if(!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session));const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>setSession(s));return()=>subscription.unsubscribe();},[loadProducts]);
  const loadOrders=async()=>{if(!supabase)return;const {data,error}=await supabase.from('orders').select('id,order_number,created_at,status,subtotal_cents,order_items(product_name,quantity)').order('created_at',{ascending:false}).limit(25);if(error)toast('Could not retrieve order history','error');else setMyOrders(data||[]);};
  const inCart=products.filter(p=>cart[p.id]>0);
  const totalCount=inCart.reduce((n,p)=>n+cart[p.id],0);
  const subtotal=inCart.reduce((n,p)=>n+(p.price_cents||0)*cart[p.id],0);
  const add=(p,requested=1)=>{if(p.price_cents==null || p.stock_quantity<1 || !configured){toast('This item is not ready for ordering.','error');return;}if(maxOrderable(p.stock_quantity,cart[p.id]||0)===0){toast('The available quantity is already in your cart.','error');setCartOpen(true);return;}setCart(c=>({...c,[p.id]:nextCartQuantity(p.stock_quantity,c[p.id]||0,requested)}));setCartOpen(true);};
  const qty=(p,delta)=>setCart(c=>({...c,[p.id]:Math.max(0,Math.min(MAX_REQUEST_UNITS,p.stock_quantity,(c[p.id]||0)+delta))}));
  const beginCheckout=()=>{setCartOpen(false);if(!session){setAuthOpen(true);toast('Sign in or create a verified account before submitting an order request.');return;}setCheckoutOpen(true);};
  const logout=async()=>{await supabase?.auth.signOut();setCart({});setMyOrders([]);toast('Signed out');};
  const refreshAfterOrder=()=>{setCart({});setCheckoutOpen(false);loadOrders();loadProducts();};
  return <>
    <a className="rw-skip-link" href="#main-content">Skip to content</a>
    <SiteHeader route={route} navigate={navigate} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} session={session} loadOrders={loadOrders} setOrdersOpen={setOrdersOpen} setAuthOpen={setAuthOpen} setCartOpen={setCartOpen} totalCount={totalCount}/>
    {!configured&&<div className="setup-banner"><AlertCircle size={16}/> Demo mode — connect Supabase and set environment variables to activate the storefront and admin panel.</div>}
    {route==='shop'?<>
      <main id="main-content"><HeroExperience onExplore={()=>scrollToSection('products')} onProcess={()=>scrollToSection('how')}/>
      <section className="benefit-row"><div className="container benefit-grid">{[['verified','Review before fulfillment','Every order is reviewed individually.'],['delivery','Canadian requests','Ontario-based operations with Canadian delivery addresses.'],['stock','Inventory controlled','Stock updates after order approval.']].map(([icon,head,body])=><div className="benefit" key={head}><div className="benefit-icon"><SimpleIcon kind={icon}/></div><div><strong>{head}</strong><p>{body}</p></div></div>)}</div></section>
      <section id="products" className="rw-products-section section" aria-labelledby="rw-products-heading"><div className="container">
        <div className="rw-products-intro"><div><div className="rw-kicker"><span className="rw-kicker-line"/> THE PRODUCT / A CLOSER LOOK</div><h2 id="rw-products-heading">The essentials, <em>precisely presented.</em></h2><p>Verified product information, current CAD pricing, and availability from our inventory system.</p></div><span className="rw-products-counter">{products.length.toString().padStart(2,'0')} / PUBLISHED {products.length===1?'PRODUCT':'PRODUCTS'}</span></div>
        {products.length===0 ? <div className="empty"><Box size={36}/><h3>No published products</h3><p>Publish a product in the admin panel to make it visible here.</p></div> : <div className="rw-experience-list">{products.slice().sort((a,b)=>Number(b.volume_ml===30 && /bacteriostatic/i.test(b.name))-Number(a.volume_ml===30 && /bacteriostatic/i.test(a.name))).map((p,index)=><ProductExperience key={p.id} product={p} index={index} inCartQty={cart[p.id]||0} onAdd={add} VialVisual={VialVisual}/>)}</div>}
        <div className="rw-product-disclaimer"><ShieldCheck size={19}/><p>Product details are provided for identification, not medical guidance. Price and availability do not establish eligibility for purchase. Request submission is not an order confirmation or payment. Supply and fulfillment must meet applicable Canadian laws.</p></div>
      </div></section>
      <BrandAbout/>
      <section id="how" className="section how"><div className="container"><div className="how-head"><div className="eyebrow subtle">A STRAIGHTFORWARD PROCESS</div><h2>Simple from selection<br/>to review.</h2></div><div className="steps">{[['01','Browse & select','Review products and quantities before submitting your request.'],['02','Submit a request','Sign in, select a Canadian province or territory, and send your request securely.'],['03','Manual review','An administrator verifies eligibility and availability before fulfillment.']].map(([n,t,b])=><div className="step" key={n}><span className="step-number">{n}</span><div className="step-icon">{n==='01'?<ShoppingBag/>:n==='02'?<ClipboardList/>:<BadgeCheck/>}</div><h3>{t}</h3><p>{b}</p></div>)}</div></div></section>
      <section className="closing-cta"><div className="container closing-inner"><div><div className="eyebrow">CLEAR PROCESS. SECURE RECORDS.</div><h2>Everything in one place.</h2><p>View products, submit requests, and track your order status.</p></div><button className="btn btn-white" onClick={()=>scrollToSection('products')}>View product <ArrowRight size={18}/></button></div></section></main>
    </>:<React.Suspense fallback={<main id="main-content" className="rw-route-loading" role="status">Loading administration…</main>}><AdminPanel session={session} openAuth={()=>setAuthOpen(true)} toast={toast} onSignOut={logout} reloadPublic={loadProducts}/></React.Suspense>}
    <SiteFooter navigate={navigate}/>
    <Notice message={notice} onClose={()=>setNotice(null)}/>
    {cartOpen&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setCartOpen(false)}}><div className="drawer"><div className="drawer-head"><div><small>YOUR SELECTION</small><h2>Order cart <span>({totalCount})</span></h2></div><button className="round-close" onClick={()=>setCartOpen(false)}><X/></button></div><div className="drawer-content">{inCart.length===0?<div className="empty-cart"><ShoppingBag size={42}/><h3>Your cart is empty</h3><p>Add an available product to begin.</p><button className="btn btn-primary" onClick={()=>setCartOpen(false)}>Continue browsing</button></div>:inCart.map(p=><div className="cart-item" key={p.id}><div className="cart-thumbnail"><Droplets size={28}/></div><div className="cart-details"><strong>{p.name}</strong><small>{p.volume_ml} mL · {money(p.price_cents)}</small><div className="qty-controls"><button aria-label="Decrease quantity" onClick={()=>qty(p,-1)}><Minus size={15}/></button><span>{cart[p.id]}</span><button aria-label="Increase quantity" onClick={()=>qty(p,1)}><Plus size={15}/></button></div></div><strong>{money(p.price_cents*cart[p.id])}</strong></div>)}</div>{totalCount>0&&<div className="drawer-bottom"><div className="total-row"><span>Estimated subtotal</span><strong>{money(subtotal)}</strong></div><p>All prices in CAD. Applicable taxes, domestic delivery charges, eligibility, and fulfillment are reviewed separately. No payment is collected.</p><button className="btn btn-primary btn-block" onClick={beginCheckout}>Continue to request <ArrowRight size={17}/></button></div>}</div></div>}
    {authOpen&&<AuthModal close={()=>setAuthOpen(false)} toast={toast} session={session}/>}
    {checkoutOpen&&<CheckoutModal close={()=>setCheckoutOpen(false)} cartItems={inCart.map(p=>({product_id:p.id,quantity:cart[p.id]}))} subtotal={subtotal} session={session} toast={toast} finished={refreshAfterOrder}/>}
    {ordersOpen&&<div className="overlay overlay-center" onMouseDown={e=>{if(e.target===e.currentTarget)setOrdersOpen(false)}}><div className="modal myorders-modal"><button className="round-close modal-x" onClick={()=>setOrdersOpen(false)}><X/></button><div className="eyebrow subtle">YOUR ACCOUNT</div><h2>Order requests</h2><p className="muted">Order requests are not payment confirmations.</p>{myOrders.length?myOrders.map(o=><div className="my-order" key={o.id}><div><strong>{o.order_number}</strong><small>{date(o.created_at)} · {o.order_items.map(i=>`${i.quantity} × ${i.product_name}`).join(', ')}</small></div><div><Pill type={o.status==='approved'?'available':o.status==='cancelled'?'muted':'neutral'}>{statusLabel[o.status]}</Pill><strong>{money(o.subtotal_cents)}</strong></div></div>):<div className="empty"><Package size={28}/><p>You have no order requests yet.</p></div>}<button className="btn btn-outline btn-block" onClick={()=>{setOrdersOpen(false);logout();}}><LogOut size={16}/> Sign out</button></div></div>}
  </>;
}

function AuthModal({close,toast,session}){
  const [mode,setMode]=useState('signin');const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [busy,setBusy]=useState(false);
  async function submit(e){e.preventDefault();if(!supabase){toast('Connect Supabase to enable sign-in.','error');return;}setBusy(true);try{
    if(mode==='signup'){
      const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin}});
      if(error)throw error;
      if(data.session){toast('Account created.');close();}else{toast('Check your inbox to verify your email before signing in.');setMode('signin');}
    }else{
      const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;toast('Signed in successfully');close();
    }
  }catch(err){toast(err.message||'Authentication failed','error');}finally{setBusy(false);}}
  return <div className="overlay overlay-center" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="modal auth-modal"><button className="round-close modal-x" onClick={close}><X/></button><span className="auth-mark"><LockKeyhole size={24}/></span><div className="eyebrow subtle">SECURE ACCOUNT</div><h2>{mode==='signin'?'Welcome back.':'Create an account.'}</h2><p className="muted">{mode==='signin'?'Access your order requests and admin tools.':'Email verification is required before placing an order.'}</p><div className="tabs"><button className={mode==='signin'?'active':''} onClick={()=>setMode('signin')}>Sign in</button><button className={mode==='signup'?'active':''} onClick={()=>setMode('signup')}>Create account</button></div><form onSubmit={submit} className="form-stack"><Field label="Email address"><input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></Field><Field label="Password"><input type="password" required minLength={6} autoComplete={mode==='signin'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter password"/></Field><button className="btn btn-primary btn-block" disabled={busy}>{busy?'Please wait…':mode==='signin'?'Sign in':'Create account'} <ArrowRight size={16}/></button></form><p className="auth-help">Accounts are managed securely through Supabase Authentication.</p></div></div>;
}

function CheckoutModal({close,session,cartItems,subtotal,toast,finished}){
  const [name,setName]=useState('');const [address,setAddress]=useState('');const [city,setCity]=useState('');const [region,setRegion]=useState('ON');const [postal,setPostal]=useState('');const [notes,setNotes]=useState('');const [busy,setBusy]=useState(false);
  async function submit(e){e.preventDefault();setBusy(true);try{
    const response=await callApi('submit-order',session,{name,shipping:{address:address.trim(),city:city.trim(),region,postal:formatCanadianPostal(postal),country:'Canada'},notes,items:cartItems});
    toast(`${response.message} Reference: ${response.order_id.slice(0,8).toUpperCase()}`);finished();
  }catch(err){toast(err.message,'error');}finally{setBusy(false);}}
  return <div className="overlay overlay-center" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="modal checkout-modal"><button className="round-close modal-x" onClick={close}><X/></button><div className="eyebrow subtle">ORDER REQUEST</div><h2>Review & submit.</h2><div className="checkout-summary"><span>Products subtotal</span><strong>{money(subtotal)}</strong><small>CAD product subtotal only. Shipping and applicable taxes are reviewed before any sale; no payment is processed.</small></div><form onSubmit={submit} className="form-stack checkout-form"><Field label="Full name"><input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="First and last name"/></Field><Field label="Account email"><input disabled value={session?.user?.email||''}/></Field><Field label="Street address"><input required minLength={5} maxLength={150} value={address} onChange={e=>setAddress(e.target.value)} placeholder="Street and unit number"/></Field><div className="two-col"><Field label="City"><input required value={city} maxLength={100} onChange={e=>setCity(e.target.value)}/></Field><Field label="Province or territory"><select required value={region} onChange={e=>setRegion(e.target.value)}>{CANADIAN_PROVINCES.map(province=><option key={province.code} value={province.code}>{province.name}</option>)}</select></Field></div><div className="two-col"><Field label="Canadian postal code"><input required value={postal} maxLength={7} placeholder="K1A 0B1" autoCapitalize="characters" onChange={e=>setPostal(e.target.value.toUpperCase())} pattern="[A-Za-z][0-9][A-Za-z][ ]?[0-9][A-Za-z][0-9]" title="Enter a Canadian postal code, for example K1A 0B1"/></Field><Field label="Country"><input value="Canada" disabled/></Field></div><Field label="Notes (optional)"><textarea rows="2" maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Delivery or order details"/></Field><div className="policy-note"><ShieldCheck size={18}/> Requests are limited to Canadian delivery addresses. Submission is not a sale. The Ontario-based operator must review eligibility, compliance, shipping, and the applicable tax treatment before fulfillment.</div><button disabled={busy} className="btn btn-primary btn-block">{busy?'Submitting…':'Submit order request'} <ArrowRight size={17}/></button></form></div></div>;
}
