import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {ArrowRight,Check,ChevronDown,Droplet,Lock,LogOut,Menu,Minus,Plus,ShoppingBag,UserRound,X} from 'lucide-react';
import {supabase,callApi,money} from './supabase';
import {CANADIAN_PROVINCES,formatCanadianPostal} from './canada';
import ClinicalGallery from './ClinicalGallery';
import {useDialogFocus} from './useDialogFocus';
import './clinical-hero.css';
import {vialCount,formatAvailability,isRequestable} from './packaging';
const AdminPanel=React.lazy(()=>import('./AdminPanel.jsx'));
const toSection=id=>document.getElementById(id)?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
const date=d=>new Date(d).toLocaleDateString('en-CA',{year:'numeric',month:'short',day:'numeric'});
const statusLabels={pending_review:'Pending review',approved:'Approved / reserved',fulfilled:'Fulfilled',cancelled:'Cancelled'};
const getAvailable=p=>Math.max(0,Number(p?.available_packages)||0);
const cartCountVials=vialCount;
function Brand(){return <span className="brand"><span className="brand-logo"><Droplet size={24} strokeWidth={1.65}/></span><span className="brand-words"><strong>RECON<span>WATER</span></strong><small>ONTARIO · CANADA</small></span></span>}
function Notice({message,clear}){return message?<div className={`notice ${message.error?'is-error':''}`} role="status"><span>{message.text}</span><button aria-label="Dismiss message" onClick={clear}><X size={17}/></button></div>:null}
function Field({label,children}){return <label className="form-field"><span>{label}</span>{children}</label>}
function MainShop({packages,stock,selected,setSelected,packQty,setPackQty,cart,onAdd}){
 const [expanded,setExpanded]=useState(null);
 const chosen=packages.find(p=>p.id===selected)||packages[0];
 const {remaining,inCart}=formatAvailability(chosen,cart,stock);
 const amount=Math.min(Math.max(1,packQty),Math.max(1,remaining));
 const available=isRequestable(chosen,{remaining});
 const total=chosen?.price_cents?money(chosen.price_cents*amount):'Price pending';
 const physicalVials=(chosen?.vials_per_pack||0)*amount;
 const isReady=packages.length>0;
 const show=panel=>setExpanded(current=>current===panel?null:panel);
 const packNames={single:'Single vial',ten:'10 vials',case:'Sealed case'};
 return <main id="main-content" className="minimal-main">
  <section id="product" className="clinical-hero"><div className="container clinical-hero-grid">
    <div className="clinical-hero-media"><ClinicalGallery/></div>
    <div className="clinical-hero-info">
      <div className="clinical-kicker">HOSPIRA / PFIZER · 30 ML</div>
      <h1>Bacteriostatic Water <span>for Injection USP</span></h1>
      <p className="clinical-subtitle">30 mL multi-dose vial · Ontario, Canada</p>
      <div className="clinical-select-title"><h2>Select packaging</h2><span>CAD</span></div>
      <fieldset className="clinical-packages"><legend className="visually-hidden">Packaging format</legend>
        {isReady?packages.map(p=><label className={`clinical-package ${chosen?.id===p.id?'is-selected':''}`} key={p.id}>
          <input type="radio" name="clinical-package" checked={chosen?.id===p.id} onChange={()=>{setSelected(p.id);setPackQty(1)}}/>
          <span className="clinical-package-check" aria-hidden="true"><Check size={14}/></span>
          <strong>{packNames[p.code]||p.label}</strong>
          <small>{p.vials_per_pack} × 30 mL{p.code==='case'?' · factory sealed':''}</small>
          <span className="clinical-package-price">{p.price_cents?money(p.price_cents):'—'}</span>
        </label>):<div className="clinical-packages-empty">Packaging and prices have not been published yet.</div>}
      </fieldset>
      {chosen&&<div className="clinical-purchase">
        <div className="clinical-purchase-price" aria-live="polite">
          <div><span>ESTIMATED PRODUCT SUBTOTAL</span><strong>{total}</strong><small>{physicalVials} vial{physicalVials!==1?'s':''} · {amount} package{amount!==1?'s':''}</small></div>
          <span className={`clinical-stock-status ${available?'is-available':''}`}>
            <span className="clinical-status-dot"/>{!chosen.active?'Unavailable':!chosen.price_cents?'Pricing pending':!getAvailable(chosen)?'Unavailable':remaining===0?'Limit reached':'Available for review'}
          </span>
        </div>
        <div className="clinical-purchase-actions">
          <div className="clinical-quantity" role="group" aria-label="Package quantity">
            <button type="button" aria-label="Decrease package quantity" disabled={!available||amount<=1} onClick={()=>setPackQty(Math.max(1,amount-1))}><Minus size={17}/></button>
            <output aria-label="Package quantity">{amount}</output>
            <button type="button" aria-label="Increase package quantity" disabled={!available||amount>=remaining} onClick={()=>setPackQty(Math.min(remaining,amount+1))}><Plus size={17}/></button>
          </div>
          <button className="primary-button clinical-add-button" type="button" disabled={!available} onClick={()=>onAdd(chosen,amount)}>Add to request <ArrowRight size={18}/></button>
        </div>
        {inCart>0&&<p className="clinical-cart-count"><Check size={14}/> {inCart} of this format already in your request cart</p>}
        <p className="clinical-order-note">Requests are reviewed before confirmation. No payment is collected online.</p>
      </div>}
      <div className="clinical-quick-info" id="details">
        <button type="button" aria-expanded={expanded==='specs'} aria-controls="rw-specifications" onClick={()=>show('specs')}>Product details <ChevronDown size={17}/></button>
        {expanded==='specs'&&<div id="rw-specifications" className="clinical-quick-panel">
          <dl><div><dt>Manufacturer</dt><dd>Hospira / Pfizer Canada</dd></div><div><dt>Volume</dt><dd>30 mL per vial</dd></div><div><dt>DIN</dt><dd>00038202*</dd></div><div><dt>Packages</dt><dd>Single vial, 10-vial bundle, 25-vial factory-sealed case</dd></div></dl>
          <p>*Confirm the DIN against your actual Canadian product label.</p>
        </div>}
        <button type="button" aria-expanded={expanded==='requests'} aria-controls="rw-ordering" onClick={()=>show('requests')}>How requests work <ChevronDown size={17}/></button>
        {expanded==='requests'&&<div id="rw-ordering" className="clinical-quick-panel">
          <p>Choose a format, sign in, and submit your Canadian delivery details. An administrator reviews eligibility and available inventory before confirmation.</p>
          <p>Ten-vial bundles are assembled from one lot. Full cases are factory-sealed and tracked separately.</p>
        </div>}
      </div>
    </div>
  </div></section>
 </main>;
}

export default function App(){
 const [route,setRoute]=useState(location.pathname.startsWith('/admin')?'admin':'shop');
 const [menu,setMenu]=useState(false),[authOpen,setAuthOpen]=useState(false),[recoveryOpen,setRecoveryOpen]=useState(false),[cartOpen,setCartOpen]=useState(false),[checkout,setCheckout]=useState(false),[ordersOpen,setOrdersOpen]=useState(false);
 const [session,setSession]=useState(null),[packages,setPackages]=useState([]),[stock,setStock]=useState({loose:0,sealed:0}),[selected,setSelected]=useState(null),[packQty,setPackQty]=useState(1);
 const [cart,setCart]=useState([]),[message,setMessage]=useState(null),[orders,setOrders]=useState([]);
 const cartDialogRef=useDialogFocus(cartOpen,()=>setCartOpen(false));
 const ordersDialogRef=useDialogFocus(ordersOpen,()=>setOrdersOpen(false));
 const alert=(text,error=false)=>setMessage({text,error});
 const navigate=to=>{history.pushState({},'',to==='admin'?'/admin':'/');setRoute(to);setMenu(false);window.scrollTo(0,0);};
 useEffect(()=>{const pop=()=>setRoute(location.pathname.startsWith('/admin')?'admin':'shop');window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop)},[]);
 const refresh=useCallback(async()=>{
  try{const res=await fetch('/.netlify/functions/api?action=catalogue',{cache:'no-store'});if(!res.ok)throw Error('Catalogue temporarily unavailable');const data=await res.json();
    setPackages(data.packages||[]);setStock(data.stock||{loose:0,sealed:0});setSelected(s=>data.packages?.some(p=>p.id===s)?s:(data.packages?.[0]?.id||null));
  }catch(e){alert(e.message,true)}
 },[]);
 useEffect(()=>{refresh();if(!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session));const {data:{subscription}}=supabase.auth.onAuthStateChange((event,s)=>{setSession(s);if(event==='PASSWORD_RECOVERY')setRecoveryOpen(true)});return()=>subscription.unsubscribe()},[refresh]);
 const liveCart=useMemo(()=>cart.map(l=>{const p=packages.find(x=>x.id===l.package_id);return p?{...p,quantity:l.quantity}:null}).filter(Boolean),[cart,packages]);
 const subtotal=liveCart.reduce((n,p)=>n+(p.price_cents||0)*p.quantity,0);
 const add=(p,n)=>{
   const {remaining,inCart}=formatAvailability(p,cart,stock);
   if(!isRequestable(p,{remaining})){alert('Selected format is not available for this request.',true);return;}
   const amount=Math.min(remaining,Math.max(1,n));
   setCart(c=>[...c.filter(x=>x.package_id!==p.id),{package_id:p.id,quantity:inCart+amount,stock_kind:p.stock_kind,vials_per_pack:p.vials_per_pack}]);
   setCartOpen(true);
 };
 const adjust=(p,delta)=>setCart(c=>{
   const current=c.find(x=>x.package_id===p.id)?.quantity||0;
   if(delta<0){const n=current-1;return [...c.filter(x=>x.package_id!==p.id),...(n>0?[{package_id:p.id,quantity:n,stock_kind:p.stock_kind,vials_per_pack:p.vials_per_pack}]:[])];}
   const {remaining}=formatAvailability(p,c,stock);
   if(remaining<=0) return c;
   return [...c.filter(x=>x.package_id!==p.id),{package_id:p.id,quantity:current+1,stock_kind:p.stock_kind,vials_per_pack:p.vials_per_pack}];
 });
 const begin=()=>{setCartOpen(false);if(!session){setAuthOpen(true);alert('Please sign in with a verified account to submit a request.');return}setCheckout(true)};
 const loadOrders=async()=>{if(!supabase)return;const {data,error}=await supabase.from('orders').select('id,order_number,created_at,status,subtotal_cents,order_items(product_name,sku,quantity,package_label,vials_per_pack)').order('created_at',{ascending:false}).limit(40);if(error)alert('Could not retrieve request history.',true);else setOrders(data||[])};
 const signOut=async()=>{await supabase?.auth.signOut();setCart([]);setOrders([]);alert('Signed out successfully')};
 const navClick=id=>{if(route==='admin'){navigate('shop');setTimeout(()=>toSection(id),90)}else toSection(id);setMenu(false)};
 return <>
  <header className="site-header"><div className="container header-row"><button className="brand-button" onClick={()=>navigate('shop')} aria-label="Recon Water home"><Brand/></button>
   <nav className={menu?'nav-links nav-open':'nav-links'} aria-label="Primary navigation"><button onClick={()=>navClick('product')}>Product</button><button onClick={()=>navClick('details')}>Details</button></nav>
   <div className="header-tools"><button className="text-tool" onClick={()=>session?(loadOrders(),setOrdersOpen(true)):setAuthOpen(true)}><UserRound size={19}/><span>{session?'My requests':'Account'}</span></button><button className="cart-trigger" aria-label="Open request cart" onClick={()=>setCartOpen(true)}><ShoppingBag size={19}/><span>{cart.reduce((n,i)=>n+i.quantity,0)}</span></button><button className="mobile-trigger" aria-expanded={menu} aria-label="Toggle navigation" onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button></div>
  </div></header>
  {route==='shop'?<MainShop packages={packages} stock={stock} selected={selected} setSelected={setSelected} packQty={packQty} setPackQty={setPackQty} cart={cart} onAdd={add}/>:<React.Suspense fallback={<main className="loading-admin">Loading administrator workspace…</main>}><AdminPanel session={session} openAuth={()=>setAuthOpen(true)} toast={alert} onSignOut={signOut} reloadPublic={refresh}/></React.Suspense>}
  <footer className="site-footer"><div className="container minimal-footer"><div><strong>RECON WATER</strong><span>Ontario, Canada</span></div><p>Independent operator; not affiliated with Pfizer or Hospira. Product requests are subject to review. No payment is collected online.</p><span>© {new Date().getFullYear()} Recon Water</span></div></footer>
  <Notice message={message} clear={()=>setMessage(null)}/>
  {cartOpen&&<div className="scrim" onMouseDown={e=>e.target===e.currentTarget&&setCartOpen(false)}><aside ref={cartDialogRef} className="cart-drawer" role="dialog" aria-modal="true" aria-label="Request cart"><div className="drawer-header"><div><span className="section-eyebrow">YOUR SELECTION</span><h2>Request cart.</h2></div><button className="icon-button" aria-label="Close cart" onClick={()=>setCartOpen(false)}><X/></button></div><div className="drawer-lines">{liveCart.length?liveCart.map(p=><div className="drawer-line" key={p.id}><div className="mini-product"><Droplet size={24}/></div><div className="drawer-detail"><strong>{p.label}</strong><small>{p.vials_per_pack} × 30 mL · {money(p.price_cents)} per package</small><div className="mini-stepper"><button aria-label={`Remove one ${p.label}`} onClick={()=>adjust(p,-1)}><Minus size={14}/></button><span>{p.quantity}</span><button aria-label={`Add one ${p.label}`} onClick={()=>adjust(p,1)}><Plus size={14}/></button></div></div><strong>{money(p.quantity*p.price_cents)}</strong></div>):<div className="empty-state"><ShoppingBag size={38}/><h3>Your request is empty</h3><p>Select a packaging format to continue.</p></div>}</div>{liveCart.length>0&&<div className="drawer-bottom"><div className="drawer-summary"><span>{cartCountVials(cart)} total vials · Product subtotal</span><strong>{money(subtotal)}</strong></div><p>Packaging and product subtotal only. Taxes, delivery, eligibility and fulfillment are reviewed separately.</p><button className="primary-button" onClick={begin}>Continue request <ArrowRight size={18}/></button></div>}</aside></div>}
  {authOpen&&<Auth close={()=>setAuthOpen(false)} alert={alert}/>}
  {recoveryOpen&&<Recovery close={()=>setRecoveryOpen(false)} alert={alert}/>}
  {checkout&&<Checkout close={()=>setCheckout(false)} session={session} items={liveCart} subtotal={subtotal} alert={alert} finished={()=>{setCheckout(false);setCart([]);refresh()}}/>}
  {ordersOpen&&<div className="scrim centered" onMouseDown={e=>e.target===e.currentTarget&&setOrdersOpen(false)}><section ref={ordersDialogRef} className="dialog order-history" role="dialog" aria-modal="true" aria-label="Your requests"><button className="dialog-x" onClick={()=>setOrdersOpen(false)} aria-label="Close requests"><X/></button><span className="section-eyebrow">ACCOUNT</span><h2>Your requests</h2><p>Requests are not sales or payment confirmations.</p>{orders.length?orders.map(o=><div className="history-row" key={o.id}><div><strong>{o.order_number}</strong><small>{date(o.created_at)} · {(o.order_items||[]).map(i=>`${i.quantity} × ${i.package_label||'Single vial'}`).join(', ')}</small></div><div><span>{statusLabels[o.status]}</span><strong>{money(o.subtotal_cents)}</strong></div></div>):<p>No requests recorded.</p>}<button className="secondary-button full" onClick={()=>{setOrdersOpen(false);signOut()}}><LogOut size={16}/> Sign out</button></section></div>}
 </>;
}
function Auth({close,alert}){
 const dialogRef=useDialogFocus(true,close);
 const [mode,setMode]=useState('sign-in'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false);
 const submit=async e=>{e.preventDefault();if(!supabase){alert('Supabase authentication is not configured.',true);return}setBusy(true);try{
  if(mode==='reset'){const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});if(error)throw error;alert('If the account exists, a recovery email has been sent.');close();}
  else if(mode==='create'){const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin}});if(error)throw error;
   alert(data.session?'Account created.':'Check your email for a verification link.');if(data.session)close();else setMode('sign-in');}
  else {const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;alert('Signed in');close();}
 }catch(e){alert(e.message||'Authentication failed',true)}finally{setBusy(false)}};
 return <div className="scrim centered" onMouseDown={e=>e.target===e.currentTarget&&close()}><div ref={dialogRef} className="dialog auth-dialog" role="dialog" aria-modal="true" aria-label="Account access"><button className="dialog-x" onClick={close} aria-label="Close"><X/></button><div className="auth-symbol"><Lock size={25}/></div><span className="section-eyebrow">SECURE ACCOUNT</span><h2>{mode==='reset'?'Recover access.':mode==='create'?'Create an account.':'Welcome back.'}</h2><p>Verified account access is required for request submission.</p><form onSubmit={submit} className="form-stack"><Field label="Email address"><input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></Field>{mode!=='reset'&&<Field label="Password"><input type="password" minLength={6} required autoComplete={mode==='create'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></Field>}<button className="primary-button" disabled={busy}>{busy?'Please wait…':mode==='reset'?'Send recovery email':mode==='create'?'Create account':'Sign in'} <ArrowRight size={17}/></button></form><div className="auth-options"><button onClick={()=>setMode(mode==='create'?'sign-in':'create')}>{mode==='create'?'Already have an account?':'Create an account'}</button><button onClick={()=>setMode(mode==='reset'?'sign-in':'reset')}>{mode==='reset'?'Back to sign in':'Forgot password?'}</button></div></div></div>;
}
function Checkout({close,session,items,subtotal,alert,finished}){
 const dialogRef=useDialogFocus(true,close);
 const [name,setName]=useState(''),[address,setAddress]=useState(''),[city,setCity]=useState(''),[region,setRegion]=useState('ON'),[postal,setPostal]=useState(''),[notes,setNotes]=useState(''),[busy,setBusy]=useState(false);
 const submit=async e=>{e.preventDefault();setBusy(true);try{const res=await callApi('submit-order',session,{name,shipping:{address:address.trim(),city:city.trim(),region,postal:formatCanadianPostal(postal),country:'Canada'},notes,items:items.map(p=>({package_id:p.id,quantity:p.quantity}))});alert(`${res.message} Reference ${res.order_id.slice(0,8).toUpperCase()}.`);finished()}catch(e){alert(e.message||'Unable to submit',true)}finally{setBusy(false)}};
 return <div className="scrim centered" onMouseDown={e=>e.target===e.currentTarget&&!busy&&close()}><div ref={dialogRef} className="dialog checkout-dialog" role="dialog" aria-modal="true" aria-label="Submit request"><button className="dialog-x" onClick={close} aria-label="Close" disabled={busy}><X/></button><span className="section-eyebrow">REVIEW REQUEST</span><h2>Submission details.</h2><div className="checkout-top">{items.map(p=><div key={p.id}><span>{p.quantity} × {p.label} ({p.quantity*p.vials_per_pack} vials)</span><strong>{money(p.quantity*p.price_cents)}</strong></div>)}<div className="checkout-total"><span>Product subtotal · CAD</span><strong>{money(subtotal)}</strong></div></div><form onSubmit={submit} className="form-stack"><Field label="Full name"><input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="Account email"><input disabled value={session?.user?.email||''}/></Field><Field label="Street address"><input required minLength={5} maxLength={150} value={address} onChange={e=>setAddress(e.target.value)}/></Field><div className="field-pair"><Field label="City"><input required minLength={2} maxLength={100} value={city} onChange={e=>setCity(e.target.value)}/></Field><Field label="Province / Territory"><select value={region} onChange={e=>setRegion(e.target.value)}>{CANADIAN_PROVINCES.map(p=><option key={p.code} value={p.code}>{p.name}</option>)}</select></Field></div><Field label="Canadian postal code"><input required value={postal} maxLength={7} placeholder="K1A 0B1" onChange={e=>setPostal(e.target.value.toUpperCase())} pattern="[A-Za-z][0-9][A-Za-z][ ]?[0-9][A-Za-z][0-9]"/></Field><Field label="Notes (optional)"><textarea rows={2} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)}/></Field><p className="checkout-warning">No payment is collected. Requests do not reserve stock. Approval requires eligibility and inventory review.</p><button className="primary-button" disabled={busy}>{busy?'Submitting…':'Submit request'} <ArrowRight size={17}/></button></form></div></div>;
}

function Recovery({close,alert}){
 const dialogRef=useDialogFocus(true,null);
 const [password,setPassword]=useState(''),[busy,setBusy]=useState(false);
 const submit=async e=>{e.preventDefault();setBusy(true);try{const {error}=await supabase.auth.updateUser({password});if(error)throw error;alert('Password updated successfully.');close();}catch(e){alert(e.message||'Unable to update password',true)}finally{setBusy(false)}};
 return <div className="scrim centered"><div ref={dialogRef} className="dialog auth-dialog" role="dialog" aria-modal="true" aria-label="Set a new password"><div className="auth-symbol"><Lock size={25}/></div><span className="section-eyebrow">ACCOUNT RECOVERY</span><h2>Set a new password.</h2><p>Your recovery link has been verified. Choose a new password below.</p><form onSubmit={submit} className="form-stack"><Field label="New password"><input required autoComplete="new-password" type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)}/></Field><button className="primary-button" disabled={busy}>{busy?'Updating…':'Update password'} <ArrowRight size={17}/></button></form></div></div>;
}
