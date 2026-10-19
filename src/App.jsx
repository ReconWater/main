import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, ArrowUpRight, ArrowDown, MapPin, BadgeCheck, Box, Check, CheckCircle2, ChevronDown, ClipboardList, CreditCard, Droplets, FileText, HeartPulse, LayoutDashboard, LockKeyhole, LogIn, LogOut, Menu, Minus, Package, PackageCheck, Plus, Search, ShieldCheck, ShoppingBag, SlidersHorizontal, Sparkles, Truck, UserRound, Warehouse, X, AlertCircle, RefreshCcw, Save, PencilLine, Clock, Trash2 } from 'lucide-react';
import { supabase, configured, callApi, money } from './supabase';
import { CANADIAN_PROVINCES, formatCanadianPostal } from './canada';

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
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({behavior:'smooth'}), route === 'shop' ? 0 : 75);
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

function HomepageHero({onExplore,onProcess}) {
  return <section className="rw-hero" aria-labelledby="rw-hero-heading">
    <div className="rw-hero-glow" aria-hidden="true"/>
    <div className="container rw-hero-grid">
      <div className="rw-hero-copy">
        <div className="rw-kicker"><span className="rw-kicker-line"/> A NEW STANDARD OF CLARITY</div>
        <h1 id="rw-hero-heading">Every detail.<br/><span>Considered.</span></h1>
        <p className="rw-hero-intro">An independent Ontario-based destination for clear product information, current availability, and a straightforward request experience.</p>
        <div className="rw-hero-actions">
          <button type="button" className="rw-button rw-button-primary" onClick={onExplore}>Explore the product <ArrowUpRight size={19}/></button>
          <button type="button" className="rw-button rw-button-link" onClick={onProcess}>Our process <ArrowRight size={17}/></button>
        </div>
        <div className="rw-hero-signals">
          <span><ShieldCheck size={17}/> Requests reviewed individually</span>
          <span><MapPin size={17}/> Ontario, Canada</span>
        </div>
      </div>
      <div className="rw-hero-stage">
        <div className="rw-stage-grain" aria-hidden="true"/>
        <div className="rw-stage-head"><span className="rw-stage-index">01 / PRODUCT FOCUS</span><span className="rw-stage-circle"><ArrowUpRight size={16}/></span></div>
        <div className="rw-stage-vial"><VialVisual large/></div>
        <div className="rw-stage-footer">
          <div><span className="rw-stage-category">BACTERIOSTATIC WATER FOR INJECTION USP</span><strong>30 mL <span>multi-dose vial</span></strong></div>
          <span className="rw-stage-cross" aria-hidden="true">✳</span>
        </div>
        <p className="rw-stage-caveat">Concept illustration · Actual packaging and labeling may differ.</p>
      </div>
    </div>
    <div className="container rw-hero-end"><span>PRODUCT INFORMATION, REFINED</span><span>SCROLL TO EXPLORE <ArrowDown size={14}/></span></div>
  </section>;
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
    <div className="rw-footer-col"><h3>Explore</h3><button onClick={()=>{navigate('shop');window.setTimeout(()=>document.getElementById('products')?.scrollIntoView({behavior:'smooth'}),75);}}>Product information <ArrowUpRight size={13}/></button><button onClick={()=>{navigate('shop');window.setTimeout(()=>document.getElementById('how')?.scrollIntoView({behavior:'smooth'}),75);}}>How it works <ArrowUpRight size={13}/></button><button onClick={()=>navigate('admin')}>Administration <ArrowUpRight size={13}/></button></div>
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
  const navigate = (to)=>{ const url=to==='admin'?'/admin':'/'; window.history.pushState({},'',url); setRoute(to);setMobileOpen(false);window.scrollTo({top:0,behavior:'smooth'}); };
  useEffect(()=>{const change=()=>setRoute(window.location.pathname.startsWith('/admin')?'admin':'shop');window.addEventListener('popstate',change);return()=>window.removeEventListener('popstate',change);},[]);
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
  const add=(p)=>{if(p.price_cents==null || p.stock_quantity<1 || !configured){toast('This item is not ready for ordering.','error');return;}setCart(c=>({...c,[p.id]:Math.min(p.stock_quantity,(c[p.id]||0)+1)}));setCartOpen(true);};
  const qty=(p,delta)=>setCart(c=>({...c,[p.id]:Math.max(0,Math.min(p.stock_quantity,(c[p.id]||0)+delta))}));
  const beginCheckout=()=>{setCartOpen(false);if(!session){setAuthOpen(true);toast('Sign in or create a verified account before submitting an order request.');return;}setCheckoutOpen(true);};
  const logout=async()=>{await supabase?.auth.signOut();setCart({});setMyOrders([]);toast('Signed out');};
  const refreshAfterOrder=()=>{setCart({});setCheckoutOpen(false);loadOrders();loadProducts();};
  return <>
    <SiteHeader route={route} navigate={navigate} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} session={session} loadOrders={loadOrders} setOrdersOpen={setOrdersOpen} setAuthOpen={setAuthOpen} setCartOpen={setCartOpen} totalCount={totalCount}/>
    {!configured&&<div className="setup-banner"><AlertCircle size={16}/> Demo mode — connect Supabase and set environment variables to activate the storefront and admin panel.</div>}
    {route==='shop'?<>
      <main><HomepageHero onExplore={()=>document.getElementById('products')?.scrollIntoView({behavior:'smooth'})} onProcess={()=>document.getElementById('how')?.scrollIntoView({behavior:'smooth'})}/>
      <section className="benefit-row"><div className="container benefit-grid">{[['verified','Review before fulfillment','Every order is reviewed individually.'],['delivery','Canadian requests','Ontario-based operations with Canadian delivery addresses.'],['stock','Inventory controlled','Stock updates after order approval.']].map(([icon,head,body])=><div className="benefit" key={head}><div className="benefit-icon"><SimpleIcon kind={icon}/></div><div><strong>{head}</strong><p>{body}</p></div></div>)}</div></section>
      <section id="products" className="section catalog"><div className="container"><div className="section-head"><div><div className="eyebrow subtle">PRODUCT INFORMATION</div><h2>Our focus<span className="period">.</span></h2><p>Product details, CAD pricing, and availability in one place.</p></div><div className="result-count"><SlidersHorizontal size={17}/> {products.length} {products.length===1?'product':'products'}</div></div>
      {products.length===0?<div className="empty"><Box size={36}/><h3>No published Canadian products</h3><p>Use the admin panel to publish the first product.</p></div>:<div className="product-grid">{products.map(p=><article className="product-card" key={p.id}><div className="product-photo"><div className="product-topline"><Pill type={p.stock_quantity>0?'available':'muted'}>{p.stock_quantity>0?'AVAILABLE':'UNAVAILABLE'}</Pill><span>{p.volume_ml?`${p.volume_ml} mL`:p.sku}</span></div><VialVisual/></div><div className="product-body"><div className="product-meta">PRODUCT · {p.sku}</div><h3>{p.name}</h3><p>{p.description}</p><div className="product-bottom"><div><small>UNIT PRICE · CAD</small><strong>{money(p.price_cents)}</strong></div><button className="btn btn-small btn-primary" onClick={()=>add(p)} disabled={!configured || p.stock_quantity<1 || p.price_cents==null}>{p.stock_quantity>0 && p.price_cents!=null?'Add to cart':'Not available'} <ArrowRight size={16}/></button></div></div></article>)}</div>}
      <div className="disclaimer"><ShieldCheck size={20}/><p>Product details are provided for identification only, not medical guidance. Supply, customer eligibility, shipping, and fulfillment must meet applicable laws. Nothing on this site authorizes use or sale of a regulated product.</p></div></div></section>
      <BrandAbout/>
      <section id="how" className="section how"><div className="container"><div className="how-head"><div className="eyebrow subtle">A STRAIGHTFORWARD PROCESS</div><h2>Simple from selection<br/>to review.</h2></div><div className="steps">{[['01','Browse & select','Review products and quantities before submitting your request.'],['02','Submit a request','Sign in, select a Canadian province or territory, and send your request securely.'],['03','Manual review','An administrator verifies eligibility and availability before fulfillment.']].map(([n,t,b])=><div className="step" key={n}><span className="step-number">{n}</span><div className="step-icon">{n==='01'?<ShoppingBag/>:n==='02'?<ClipboardList/>:<BadgeCheck/>}</div><h3>{t}</h3><p>{b}</p></div>)}</div></div></section>
      <section className="closing-cta"><div className="container closing-inner"><div><div className="eyebrow">CLEAR PROCESS. SECURE RECORDS.</div><h2>Everything in one place.</h2><p>View products, submit requests, and track your order status.</p></div><button className="btn btn-white" onClick={()=>document.getElementById('products')?.scrollIntoView({behavior:'smooth'})}>Browse catalogue <ArrowRight size={18}/></button></div></section></main>
    </>:<AdminPanel session={session} openAuth={()=>setAuthOpen(true)} toast={toast} onSignOut={logout} reloadPublic={loadProducts}/>}
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

function AdminPanel({session,openAuth,toast,onSignOut,reloadPublic}){
  const [tab,setTab]=useState('overview');const [data,setData]=useState(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [editing,setEditing]=useState(null);const [stockItem,setStockItem]=useState(null);const [manualOpen,setManualOpen]=useState(false);const [search,setSearch]=useState('');
  const refresh=useCallback(async()=>{
    if(!session){setData(null);setError('');return;}
    setBusy(true);try{const result=await callApi('dashboard',session);setData(result);setError('');}
    catch(err){setData(null);setError(err.message);}finally{setBusy(false);}
  },[session?.access_token]);
  useEffect(()=>{refresh();},[refresh]);
  async function act(action,payload,success){try{setBusy(true);await callApi(action,session,payload);toast(success);await refresh();await reloadPublic();return true;}catch(err){toast(err.message,'error');return false;}finally{setBusy(false);}}
  const products=data?.products||[],orders=data?.orders||[],movements=data?.movements||[];
  const lowStock=products.filter(p=>p.stock_quantity<=p.low_stock_threshold),active=products.filter(p=>p.is_active).length;
  const pending=orders.filter(o=>o.status==='pending_review');
  const committed=orders.filter(o=>['approved','fulfilled'].includes(o.status));
  const revenue=committed.reduce((s,o)=>s+o.subtotal_cents,0);
  if(!session)return <main className="admin-auth-shell"><div className="admin-login-card"><div className="auth-mark"><LockKeyhole/></div><div className="eyebrow subtle">RESTRICTED ACCESS</div><h1>Administration</h1><p>Sign in with an authorized administrator account to manage pricing, inventory, and orders.</p><button className="btn btn-primary" onClick={openAuth}>Administrator sign in <ArrowRight size={18}/></button></div></main>;
  if(error)return <main className="admin-auth-shell"><div className="admin-login-card"><AlertCircle className="red-icon" size={36}/><h1>Access unavailable</h1><p>{error==='Administrator access required'?'This account is not authorized for the admin portal. An existing administrator must grant access in Supabase.':error}</p><button className="btn btn-outline" onClick={refresh}><RefreshCcw size={16}/> Retry</button> <button className="btn btn-text" onClick={onSignOut}>Sign out</button></div></main>;
  return <main className="admin-shell"><div className="admin-layout"><aside className="admin-sidebar"><div className="admin-side-title"><span className="admin-side-mark"><LayoutDashboard size={22}/></span><div><strong>Control center</strong><small>ONTARIO · CANADA</small></div></div><div className="sidebar-label">WORKSPACE</div>{[['overview',LayoutDashboard,'Overview'],['products',Package,'Products & pricing'],['inventory',Warehouse,'Inventory'],['orders',ClipboardList,'Orders']].map(([v,I,t])=><button key={v} className={`side-link ${tab===v?'selected':''}`} onClick={()=>setTab(v)}><I size={18}/>{t}{v==='orders'&&pending.length>0&&<b>{pending.length}</b>}</button>)}<div className="sidebar-bottom"><button className="side-link" onClick={refresh}><RefreshCcw size={17}/> Refresh data</button><button className="side-link" onClick={onSignOut}><LogOut size={17}/> Sign out</button></div></aside><div className="admin-content"><div className="admin-heading"><div><div className="eyebrow subtle">ADMINISTRATION / {tab.toUpperCase()}</div><h1>{({overview:'Dashboard',products:'Products & pricing',inventory:'Stock management',orders:'Order management'})[tab]}</h1><p>{({overview:'Ontario-based operation · CAD pricing · Canadian orders.',products:'Maintain listings, prices, and catalogue visibility.',inventory:'Audit and adjust available stock.',orders:'Review requests and manage fulfillment.'})[tab]}</p></div><div className="admin-heading-actions">{busy&&<span className="busy-dot"/>}<button className="btn btn-outline btn-small" onClick={refresh}><RefreshCcw size={16}/> Refresh</button></div></div>
    {!data?<div className="admin-loading"><RefreshCcw className="spin"/> Loading secure records…</div>:<>
    {tab==='overview'&&<><div className="metric-grid"><Metric icon={Package} label="Published products" value={active} foot={`${products.length} total products`}/><Metric icon={ClipboardList} label="Pending requests" value={pending.length} foot="Awaiting review" accent/><Metric icon={Warehouse} label="Low stock items" value={lowStock.length} foot="At or below threshold"/><Metric icon={Activity} label="Approved order value" value={money(revenue)} foot="Excludes tax and shipping"/></div><div className="admin-duo"><div className="panel"><div className="panel-head"><div><h2>Recent requests</h2><p>Most recently placed orders</p></div><button className="text-link" onClick={()=>setTab('orders')}>View all <ArrowRight size={15}/></button></div>{orders.length?orders.slice(0,5).map(o=><div className="overview-order" key={o.id}><div className="order-icon"><ClipboardList size={18}/></div><div><strong>{o.order_number}</strong><small>{o.customer_name} · {date(o.created_at)}</small></div><Pill type={o.status==='approved'?'available':o.status==='cancelled'?'muted':'neutral'}>{statusLabel[o.status]}</Pill></div>):<div className="empty-mini">No orders yet.</div>}</div><div className="panel"><div className="panel-head"><div><h2>Inventory watch</h2><p>Products requiring attention</p></div><button className="text-link" onClick={()=>setTab('inventory')}>Manage <ArrowRight size={15}/></button></div>{lowStock.length?lowStock.slice(0,6).map(p=><div className="stock-watch" key={p.id}><div><strong>{p.name}</strong><small>{p.sku}</small></div><Pill type="warning">{p.stock_quantity} units</Pill></div>):<div className="empty-mini"><CheckCircle2 size={19}/> All products are above their stock thresholds.</div>}</div></div></>}
    {tab==='products'&&<div className="panel"><div className="panel-head"><div><h2>Product catalogue</h2><p>Edit prices, descriptions, and publication status.</p></div><button className="btn btn-primary btn-small" onClick={()=>setEditing({})}><Plus size={17}/> Add product</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>PRODUCT</th><th>SKU</th><th>PRICE</th><th>STOCK</th><th>STATUS</th><th></th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td><div className="table-product"><span className="tiny-icon"><Droplets size={17}/></span><div><strong>{p.name}</strong><small>{p.volume_ml?`${p.volume_ml} mL`:'—'}</small></div></div></td><td className="mono">{p.sku}</td><td className="strong-cell">{money(p.price_cents)}</td><td>{p.stock_quantity}</td><td><Pill type={p.is_active?'available':'muted'}>{p.is_active?'Published':'Hidden'}</Pill></td><td><button className="table-action" onClick={()=>setEditing(p)}><PencilLine size={16}/> Edit</button></td></tr>)}</tbody></table></div></div>}
    {tab==='inventory'&&<><div className="panel"><div className="panel-head"><div><h2>Available stock</h2><p>Stock edits are logged with a reason.</p></div><Pill type="neutral">{products.reduce((s,p)=>s+p.stock_quantity,0)} total units</Pill></div><div className="table-scroll"><table className="data-table"><thead><tr><th>PRODUCT</th><th>ON HAND</th><th>LOW STOCK AT</th><th>STATE</th><th></th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td><div><strong>{p.name}</strong><small className="table-small">{p.sku}</small></div></td><td className="strong-cell">{p.stock_quantity}</td><td>{p.low_stock_threshold}</td><td><Pill type={p.stock_quantity<=p.low_stock_threshold?'warning':'available'}>{p.stock_quantity<=p.low_stock_threshold?'Low stock':'Healthy'}</Pill></td><td><button className="table-action" onClick={()=>setStockItem(p)}>Adjust <ArrowRight size={15}/></button></td></tr>)}</tbody></table></div></div><div className="panel spaced"><div className="panel-head"><div><h2>Movement log</h2><p>Latest stock changes, newest first.</p></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>DATE</th><th>PRODUCT</th><th>CHANGE</th><th>REASON</th></tr></thead><tbody>{movements.length?movements.map(m=><tr key={m.id}><td>{date(m.created_at)}</td><td>{m.products?.name || 'Product'}</td><td><strong className={m.delta>=0?'positive':'negative'}>{m.delta>0?'+':''}{m.delta}</strong></td><td>{m.reason}</td></tr>):<tr><td colSpan="4" className="empty-cell">No inventory adjustments yet.</td></tr>}</tbody></table></div></div></>}
    {tab==='orders'&&<><div className="panel"><div className="panel-head"><div><h2>All order requests</h2><p>Canadian order requests. Approving deducts inventory; cancelling an approved order restores it.</p></div><button className="btn btn-primary btn-small" onClick={()=>setManualOpen(true)}><Plus size={17}/> Place manual order</button></div><div className="search-line"><Search size={17}/><input placeholder="Search orders, names, or emails" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="orders-list">{orders.filter(o=>(o.order_number+o.customer_name+o.customer_email).toLowerCase().includes(search.toLowerCase())).map(o=><div className="order-record" key={o.id}><div className="order-record-top"><div><strong className="mono">{o.order_number}</strong><small>{date(o.created_at)} · {o.customer_name} ({o.customer_email})</small></div><Pill type={o.status==='approved'||o.status==='fulfilled'?'available':o.status==='cancelled'?'muted':'neutral'}>{statusLabel[o.status]}</Pill></div><div className="order-record-lines">{o.order_items?.map(i=><span key={i.id}>{i.quantity} × {i.product_name} <b>{money(i.quantity*i.unit_price_cents)}</b></span>)}</div>{o.shipping && Object.keys(o.shipping).length>0&&<p className="order-address"><Truck size={15}/>{[o.shipping.address,o.shipping.city,CANADIAN_PROVINCES.find(p=>p.code===o.shipping.region)?.name||o.shipping.region,o.shipping.postal,o.shipping.country].filter(Boolean).join(', ')}</p>}{o.notes&&<p className="order-note">Note: {o.notes}</p>}<div className="order-record-bottom"><div><small>PRODUCTS SUBTOTAL</small><strong>{money(o.subtotal_cents)}</strong></div><div className="order-buttons">{o.status==='pending_review'&&<><button className="btn btn-approve btn-small" disabled={busy} onClick={()=>act('order-status',{order_id:o.id,status:'approved'},'Order approved; inventory updated.')}><Check size={16}/> Approve</button><button className="btn btn-outline btn-small" disabled={busy} onClick={()=>act('order-status',{order_id:o.id,status:'cancelled'},'Order cancelled.')}>Cancel</button></>}{o.status==='approved'&&<><button className="btn btn-primary btn-small" disabled={busy} onClick={()=>act('order-status',{order_id:o.id,status:'fulfilled'},'Order marked fulfilled.')}><PackageCheck size={16}/> Mark fulfilled</button><button className="btn btn-outline btn-small" disabled={busy} onClick={()=>act('order-status',{order_id:o.id,status:'cancelled'},'Order cancelled; stock restored.')}>Cancel & restock</button></>}</div></div></div>)}{orders.length===0&&<div className="empty-mini">No orders yet.</div>}</div></div></>}
    </>}
    </div></div>
    {editing!==null&&<ProductEditor product={editing} close={()=>setEditing(null)} busy={busy} onSave={async payload=>{if(await act('save-product',payload,'Product saved successfully.'))setEditing(null);}}/>}
    {stockItem&&<StockEditor product={stockItem} close={()=>setStockItem(null)} busy={busy} onSave={async payload=>{if(await act('set-stock',payload,'Inventory adjusted.'))setStockItem(null);}}/>}
    {manualOpen&&<ManualOrder products={products} busy={busy} close={()=>setManualOpen(false)} onSave={async payload=>{if(await act('manual-order',payload,'Manual order placed and inventory deducted.'))setManualOpen(false);}}/>}
  </main>;
}
function Metric({icon:Icon,label,value,foot,accent}){return <div className="metric"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${accent?'metric-icon-accent':''}`}><Icon size={21}/></span></div><strong>{value}</strong><small>{foot}</small></div>;}
function ProductEditor({product,close,busy,onSave}){
  const [f,setF]=useState({id:product.id||null,sku:product.sku||'',name:product.name||'',description:product.description||'',volume_ml:product.volume_ml??30,price:product.price_cents==null?'':(product.price_cents/100).toFixed(2),is_active:product.is_active??false,low_stock_threshold:product.low_stock_threshold??5});
  const set=(key,value)=>setF(c=>({...c,[key]:value}));
  const submit=e=>{e.preventDefault();onSave({...f,volume_ml:f.volume_ml===''?null:Number(f.volume_ml),price_cents:f.price===''?null:Math.round(Number(f.price)*100),low_stock_threshold:Number(f.low_stock_threshold)});};
  return <div className="overlay overlay-center" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="modal edit-modal"><button className="round-close modal-x" onClick={close}><X/></button><div className="eyebrow subtle">PRODUCT EDITOR</div><h2>{product.id?'Edit product':'New product'}</h2><form className="form-stack" onSubmit={submit}><div className="two-col"><Field label="SKU"><input required maxLength={45} value={f.sku} onChange={e=>set('sku',e.target.value)}/></Field><Field label="Volume (mL)"><input type="number" min="1" value={f.volume_ml} onChange={e=>set('volume_ml',e.target.value)}/></Field></div><Field label="Product name"><input required maxLength={130} value={f.name} onChange={e=>set('name',e.target.value)}/></Field><Field label="Description"><textarea rows="3" maxLength={800} value={f.description} onChange={e=>set('description',e.target.value)}/></Field><div className="two-col"><Field label="Price (CAD)"><input type="number" step="0.01" min="0.01" placeholder="Leave blank to hide price" value={f.price} onChange={e=>set('price',e.target.value)}/></Field><Field label="Low-stock threshold"><input type="number" min="0" max="100000" value={f.low_stock_threshold} onChange={e=>set('low_stock_threshold',e.target.value)}/></Field></div><label className="switch-row"><input type="checkbox" checked={f.is_active} onChange={e=>set('is_active',e.target.checked)}/><span><strong>Publish this product</strong><small>Visible to customers. Orders require a positive price and stock.</small></span></label><button className="btn btn-primary btn-block" disabled={busy}><Save size={17}/> Save product</button></form></div></div>;
}
function StockEditor({product,close,busy,onSave}){
  const [quantity,setQuantity]=useState(product.stock_quantity);const [reason,setReason]=useState('Stock count adjustment');
  return <div className="overlay overlay-center" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="modal edit-modal"><button className="round-close modal-x" onClick={close}><X/></button><div className="eyebrow subtle">INVENTORY CONTROL</div><h2>Adjust stock</h2><p className="muted">{product.name} · {product.sku}</p><div className="stock-current">Current available units <strong>{product.stock_quantity}</strong></div><form className="form-stack" onSubmit={e=>{e.preventDefault();onSave({product_id:product.id,quantity:Number(quantity),reason})}}><Field label="New available quantity"><input type="number" min="0" max="1000000" required value={quantity} onChange={e=>setQuantity(e.target.value)}/></Field><Field label="Reason for adjustment"><input required minLength={3} maxLength={160} value={reason} onChange={e=>setReason(e.target.value)}/></Field><div className="policy-note"><ClipboardList size={17}/> This change is recorded in the inventory movement log.</div><button disabled={busy} className="btn btn-primary btn-block"><Save size={17}/> Update stock</button></form></div></div>;
}
function ManualOrder({products,busy,close,onSave}){
  const [name,setName]=useState('');const [email,setEmail]=useState('');const [productId,setProductId]=useState(products[0]?.id||'');const [quantity,setQuantity]=useState(1);const [notes,setNotes]=useState('');const selected=products.find(p=>p.id===productId);
  return <div className="overlay overlay-center" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="modal edit-modal"><button className="round-close modal-x" onClick={close}><X/></button><div className="eyebrow subtle">ADMIN ORDER ENTRY</div><h2>Place a manual order</h2><p className="muted">Admin-entered orders are approved immediately and deduct stock.</p><form className="form-stack" onSubmit={e=>{e.preventDefault();onSave({name,email,product_id:productId,quantity:Number(quantity),notes})}}><Field label="Customer name"><input required minLength={2} value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="Customer email"><input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Product"><select value={productId} required onChange={e=>setProductId(e.target.value)}>{products.map(p=><option value={p.id} key={p.id}>{p.name} — {money(p.price_cents)} ({p.stock_quantity} in stock)</option>)}</select></Field><Field label="Quantity"><input type="number" min="1" max="100" required value={quantity} onChange={e=>setQuantity(e.target.value)}/></Field><Field label="Internal notes"><textarea rows="2" value={notes} maxLength={1000} onChange={e=>setNotes(e.target.value)}/></Field><div className="stock-current">Products subtotal <strong>{selected?.price_cents?money(selected.price_cents*Number(quantity||0)):'—'}</strong></div><button className="btn btn-primary btn-block" disabled={busy||!selected||!selected.price_cents||selected.stock_quantity<Number(quantity)}><Check size={17}/> Place approved order</button></form></div></div>;
}
