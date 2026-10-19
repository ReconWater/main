// Route-loaded administrator workspace. Customer-facing pages never import these UI assets.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowRight, Check, CheckCircle2, ClipboardList, Droplets, LayoutDashboard,
  LockKeyhole, LogOut, Package, PackageCheck, Plus, Search, ShieldCheck, Truck,
  Warehouse, X, AlertCircle, RefreshCcw, Save, PencilLine,
  SlidersHorizontal, AlertTriangle, ChevronRight
} from 'lucide-react';
import { callApi, money } from './supabase';
import { CANADIAN_PROVINCES } from './canada';
import {
  ORDER_STATUSES, statusTone, summarizeDashboard, filterOrders,
  filterProducts, validManualOrder, orderActionDescription, isLowStock
} from './adminModels';
import './admin.css';

const formatDate = value => value ? new Date(value).toLocaleString('en-CA', {
  dateStyle:'medium',timeStyle:'short',timeZone:'America/Toronto'
}) : '—';
const Field = ({label,children,hint}) => <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
const Pill = ({children,type='neutral'}) => <span className={`pill pill-${type}`}>{children}</span>;
const Status = ({value}) => <Pill type={statusTone(value)}>{ORDER_STATUSES[value] || value}</Pill>;
const EMPTY = [];
/** Shared keyboard handling for private action dialogs. */
function useAdminDialog(onClose, busy) {
  const ref=useRef(null);
  const closeRef=useRef(onClose);
  const busyRef=useRef(busy);
  closeRef.current=onClose;
  busyRef.current=busy;
  useEffect(()=>{
    const dialog=ref.current;
    const previous=document.activeElement;
    const priorOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const selector='button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
    dialog?.querySelector(selector)?.focus();
    const onKey=(event)=>{
      if(event.key==='Escape' && !busyRef.current) { event.preventDefault();closeRef.current();return; }
      if(event.key!=='Tab' || !dialog) return;
      const focusable=[...dialog.querySelectorAll(selector)].filter(el=>el.getClientRects().length>0);
      if(!focusable.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',onKey);
    return ()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow=priorOverflow;previous?.focus?.();};
  },[]);
  return ref;
}

function AdminPanel({session,openAuth,toast,onSignOut,reloadPublic}) {
  const [tab,setTab] = useState('overview');
  const [data,setData] = useState(null);
  const [dataOwner,setDataOwner] = useState(null);
  const [loading,setLoading] = useState(false);
  const [mutating,setMutating] = useState(false);
  const [error,setError] = useState('');
  const [updatedAt,setUpdatedAt] = useState(null);
  const [editing,setEditing] = useState(null);
  const [stockItem,setStockItem] = useState(null);
  const [manualOpen,setManualOpen] = useState(false);
  const [confirmAction,setConfirmAction] = useState(null);
  const [orderSearch,setOrderSearch] = useState('');
  const [productSearch,setProductSearch] = useState('');
  const [orderStatus,setOrderStatus] = useState('all');
  const actionLock = useRef(false);
  const activeUserRef = useRef(session?.user?.id);
  activeUserRef.current = session?.user?.id;
  const busy = loading || mutating;
  const token = session?.access_token;

  const refresh = useCallback(async () => {
    if (!session) { setData(null); setDataOwner(null); setError(''); setUpdatedAt(null); return; }
    setLoading(true);
    try {
      const result = await callApi('dashboard',session);
      if (activeUserRef.current !== session.user.id) return;
      setData(result); setDataOwner(session.user.id); setError(''); setUpdatedAt(new Date());
    } catch (err) {
      // Keep the last known records visible; show a clear stale-data warning.
      if (activeUserRef.current === session.user.id) setError(err?.message || 'Could not refresh records.');
    } finally { setLoading(false); }
  },[token]);
  useEffect(() => { refresh(); },[refresh]);

  async function act(action,payload,message) {
    // UI-level duplicate-click guard; SQL performs the authoritative validation.
    if (actionLock.current || !session) return false;
    actionLock.current = true;
    setMutating(true);
    try {
      await callApi(action,session,payload);
      toast(message);
      await refresh();
      try { await reloadPublic(); } catch { /* Admin mutation has already succeeded. */ }
      return true;
    } catch (err) {
      toast(err?.message || 'Operation failed. Check the current state and retry.','error');
      return false;
    } finally { actionLock.current=false; setMutating(false); }
  }

  const visibleData = session?.user?.id === dataOwner ? data : null;
  const products = visibleData?.products || EMPTY;
  const orders = visibleData?.orders || EMPTY;
  const movements = visibleData?.movements || EMPTY;
  const stats = summarizeDashboard(products,orders);
  const visibleOrders = filterOrders(orders,orderSearch,orderStatus);
  const visibleProducts = filterProducts(products,productSearch);
  const navigation = [
    ['overview',LayoutDashboard,'Overview'],
    ['products',Package,'Products & pricing'],
    ['inventory',Warehouse,'Inventory'],
    ['orders',ClipboardList,'Orders']
  ];

  if (!session) return <main id="main-content" className="admin-auth-shell"><div className="admin-login-card">
    <div className="auth-mark"><LockKeyhole/></div><div className="eyebrow subtle">RECON WATER · RESTRICTED</div>
    <h1>Operator access.</h1><p>Sign in with an approved administrator account to access private pricing, inventory, and requests.</p>
    <button className="btn btn-primary" onClick={openAuth}>Administrator sign in <ArrowRight size={18}/></button>
  </div></main>;
  if (error && !visibleData) return <main id="main-content" className="admin-auth-shell"><div className="admin-login-card">
    <AlertCircle className="red-icon" size={36}/><h1>Access unavailable</h1>
    <p>{error === 'Administrator access required' ? 'This user is not authorized for the admin dashboard. Grant access in Supabase.' : error}</p>
    <button className="btn btn-outline" onClick={refresh}><RefreshCcw size={16}/> Retry</button>{' '}
    <button className="btn btn-text" onClick={onSignOut}>Sign out</button>
  </div></main>;

  return <main id="main-content" className="admin-shell"><div className="admin-layout">
    <aside className="admin-sidebar" aria-label="Admin navigation">
      <div className="admin-side-title"><span className="admin-side-mark"><Droplets size={23}/></span><div><strong>reconwater<span>.</span></strong><small>OPERATIONS / ONTARIO</small></div></div>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="admin-nav" aria-label="Workspace">
        {navigation.map(([value,Icon,label])=><button key={value} type="button" className={`side-link ${tab===value?'selected':''}`} aria-current={tab===value?'page':undefined} onClick={()=>setTab(value)}><Icon size={18}/><span>{label}</span>{value==='orders'&&stats.pending.length>0&&<b aria-label={`${stats.pending.length} pending requests`}>{stats.pending.length}</b>}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="admin-sidebar-note"><ShieldCheck size={18}/><span>Private management<br/>CAD · Canada</span></div>
        <button className="side-link" type="button" disabled={busy} onClick={refresh}><RefreshCcw size={17}/> Refresh records</button>
        <button className="side-link" type="button" onClick={onSignOut}><LogOut size={17}/> Sign out</button>
      </div>
    </aside>
    <div className="admin-content">
      <div className="admin-heading">
        <div><div className="eyebrow subtle">CONTROL CENTER / {tab.toUpperCase()}</div>
          <h1>{({overview:'Good to have you here.',products:'Products & pricing',inventory:'Inventory control',orders:'Order requests'})[tab]}</h1>
          <p>{({overview:'Your Ontario operations at a glance.',products:'Maintain published information and CAD prices.',inventory:'Monitor stock and record adjustments.',orders:'Review requests, fulfillment, and manual entries.'})[tab]}</p></div>
        <div className="admin-heading-actions"><span className="admin-sync"><span className={busy?'admin-sync-dot admin-sync-busy':'admin-sync-dot'}/>{busy?'Syncing…':updatedAt?'Last synced '+updatedAt.toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit'}):'Not synced'}</span>
          <button className="btn btn-outline btn-small" type="button" disabled={busy} onClick={refresh}><RefreshCcw size={16} className={busy?'spin':''}/> Refresh</button><button className="admin-mobile-logout" type="button" onClick={onSignOut} aria-label="Sign out"><LogOut size={18}/></button></div>
      </div>
      {!!error&&<div className="admin-alert" role="alert"><AlertTriangle size={18}/><span>Could not refresh. The displayed data may be out of date: {error}</span><button type="button" disabled={busy} onClick={refresh}>Retry</button></div>}
      {!visibleData?<div className="admin-loading" role="status"><RefreshCcw className="spin"/> Loading authorized records…</div>:<>
        {tab==='overview'&&<>
          <div className="admin-feature"><div><span className="admin-feature-kicker"><span/> DAILY OPERATIONS</span><h2>Clarity in every detail.</h2><p>Review outstanding requests, watch available inventory, and keep your published catalogue current.</p></div>
            <div className="admin-feature-actions"><button className="btn btn-primary btn-small" onClick={()=>setTab('orders')}>Review requests <ArrowRight size={16}/></button><button className="btn btn-outline btn-small" onClick={()=>setTab('inventory')}>Manage stock</button></div></div>
          <div className="metric-grid">
            <Metric icon={Package} label="Published products" value={stats.published} foot={`${stats.unpublished} unpublished`}/>
            <Metric icon={ClipboardList} label="Recent pending requests" value={stats.pending.length} foot="Awaiting review" accent/>
            <Metric icon={Warehouse} label="Low stock alerts" value={stats.lowStock.length} foot={`${stats.outOfStock} products out of stock`}/>
            <Metric icon={Activity} label="Recent approved value" value={money(stats.committedValueCents)} foot="Latest 150 requests · not payments"/>
          </div>
          <div className="admin-duo"><section className="panel"><div className="panel-head"><div><h2>Recent requests</h2><p>Latest requests received</p></div><button className="text-link" onClick={()=>setTab('orders')}>View queue <ArrowRight size={15}/></button></div>
            {orders.length?orders.slice(0,5).map(o=><div className="overview-order" key={o.id}><div className="order-icon"><ClipboardList size={18}/></div><div><strong>{o.order_number}</strong><small>{o.customer_name} · {formatDate(o.created_at)}</small></div><Status value={o.status}/></div>):<div className="empty-mini">No requests yet.</div>}</section>
            <section className="panel"><div className="panel-head"><div><h2>Stock watch</h2><p>Published items below threshold</p></div><button className="text-link" onClick={()=>setTab('inventory')}>Manage <ArrowRight size={15}/></button></div>
            {stats.lowStock.length?stats.lowStock.slice(0,6).map(p=><div className="stock-watch" key={p.id}><div><strong>{p.name}</strong><small>{p.sku}</small></div><Pill type="warning">{p.stock_quantity} units</Pill></div>):<div className="empty-mini"><CheckCircle2 size={19}/> All published stock is above its warning threshold.</div>}</section></div>
          <p className="admin-footnote">Values represent order-request subtotals only. No payments, sales tax, or delivery charges are recorded by this dashboard.</p>
        </>}
        {tab==='products'&&<section className="panel"><div className="panel-head"><div><h2>Catalogue records</h2><p>Customer-facing details are synchronized with Supabase.</p></div><button className="btn btn-primary btn-small" disabled={busy} onClick={()=>setEditing({})}><Plus size={17}/> Add product</button></div>
          <div className="admin-table-toolbar"><label className="admin-search"><Search size={18}/><span className="sr-only">Search products</span><input placeholder="Search products or SKUs" value={productSearch} onChange={e=>setProductSearch(e.target.value)}/></label><span className="admin-count">{visibleProducts.length} of {products.length} products</span></div>
          <div className="table-scroll"><table className="data-table"><thead><tr><th scope="col">PRODUCT</th><th scope="col">SKU</th><th scope="col">PRICE / CAD</th><th scope="col">ON HAND</th><th scope="col">VISIBILITY</th><th scope="col">ACTION</th></tr></thead><tbody>
            {visibleProducts.map(p=><tr key={p.id}><td><div className="table-product"><span className="tiny-icon"><Droplets size={17}/></span><div><strong>{p.name}</strong><small>{p.volume_ml?`${p.volume_ml} mL`:'Volume not set'}</small></div></div></td><td className="mono">{p.sku}</td><td className="strong-cell">{money(p.price_cents)}</td><td>{p.stock_quantity}</td><td><Pill type={p.is_active?'available':'muted'}>{p.is_active?'Published':'Hidden'}</Pill></td><td><button className="table-action" disabled={busy} aria-label={`Edit ${p.name}`} onClick={()=>setEditing(p)}><PencilLine size={16}/> Edit</button></td></tr>)}
            {!visibleProducts.length&&<tr><td colSpan="6" className="empty-cell">No products match the search.</td></tr>}
          </tbody></table></div></section>}
        {tab==='inventory'&&<>
          <section className="panel"><div className="panel-head"><div><h2>Available units</h2><p>Quantity changes are entered manually and logged.</p></div><Pill type="neutral">{stats.availableUnits} units in all products</Pill></div>
            <div className="admin-table-toolbar"><label className="admin-search"><Search size={18}/><span className="sr-only">Search inventory</span><input placeholder="Search inventory or SKUs" value={productSearch} onChange={e=>setProductSearch(e.target.value)}/></label><span className="admin-count">{visibleProducts.length} records</span></div>
            <div className="table-scroll"><table className="data-table"><thead><tr><th scope="col">PRODUCT</th><th scope="col">ON HAND</th><th scope="col">ALERT AT</th><th scope="col">STATUS</th><th scope="col">ACTION</th></tr></thead><tbody>
              {visibleProducts.map(p=><tr key={p.id}><td><strong>{p.name}</strong><small className="table-small">{p.sku}{!p.is_active?' · hidden from catalogue':''}</small></td><td className="strong-cell">{p.stock_quantity}</td><td>{p.low_stock_threshold}</td><td><Pill type={isLowStock(p)?'warning':'available'}>{p.stock_quantity===0?'Out of stock':isLowStock(p)?'Low stock':'Healthy'}</Pill></td><td><button className="table-action" disabled={busy} onClick={()=>setStockItem(p)} aria-label={`Adjust stock for ${p.name}`}>Adjust <ChevronRight size={16}/></button></td></tr>)}
              {!visibleProducts.length&&<tr><td colSpan="5" className="empty-cell">No matching inventory records.</td></tr>}
            </tbody></table></div>
          </section>
          <section className="panel spaced"><div className="panel-head"><div><h2>Inventory audit trail</h2><p>Latest 100 stock movements, most recent first</p></div><Pill type="muted">Read-only</Pill></div>
            <div className="table-scroll"><table className="data-table"><thead><tr><th scope="col">DATE (ONTARIO)</th><th scope="col">PRODUCT</th><th scope="col">CHANGE</th><th scope="col">REASON</th></tr></thead><tbody>
              {movements.length?movements.map(m=><tr key={m.id}><td>{formatDate(m.created_at)}</td><td>{m.products?.name || 'Product'}</td><td><strong className={m.delta>=0?'positive':'negative'}>{m.delta>0?'+':''}{m.delta}</strong></td><td>{m.reason}</td></tr>):<tr><td colSpan="4" className="empty-cell">No adjustments recorded.</td></tr>}
            </tbody></table></div>
          </section>
        </>}
        {tab==='orders'&&<section className="panel"><div className="panel-head"><div><h2>Request queue</h2><p>Most recent 150 records · actions update inventory through Supabase.</p></div><button className="btn btn-primary btn-small" disabled={busy} onClick={()=>setManualOpen(true)}><Plus size={17}/> New manual order</button></div>
          <div className="admin-order-toolbar"><label className="admin-search"><Search size={18}/><span className="sr-only">Search requests</span><input placeholder="Search reference, name, email or SKU" value={orderSearch} onChange={e=>setOrderSearch(e.target.value)}/></label>
            <label className="admin-status-filter"><SlidersHorizontal size={17}/><span className="sr-only">Filter by status</span><select value={orderStatus} onChange={e=>setOrderStatus(e.target.value)}><option value="all">All statuses</option>{Object.entries(ORDER_STATUSES).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>
            <span className="admin-count">{visibleOrders.length} of {orders.length} shown</span></div>
          <div className="orders-list">{visibleOrders.map(o=><article className="order-record" key={o.id}><div className="order-record-top"><div><strong className="mono">{o.order_number}</strong><small>{formatDate(o.created_at)} · {o.customer_name} ({o.customer_email})</small></div><Status value={o.status}/></div>
            <div className="order-record-lines">{o.order_items?.map(i=><span key={i.id}>{i.quantity} × {i.product_name}<b>{money(i.quantity*i.unit_price_cents)}</b></span>)}</div>
            {o.shipping&&Object.keys(o.shipping).length>0&&<p className="order-address"><Truck size={15}/>{[o.shipping.address,o.shipping.city,CANADIAN_PROVINCES.find(p=>p.code===o.shipping.region)?.name||o.shipping.region,o.shipping.postal,o.shipping.country].filter(Boolean).join(', ')}</p>}
            {o.notes&&<p className="order-note">Internal note: {o.notes}</p>}
            <div className="order-record-bottom"><div><small>PRODUCT SUBTOTAL · CAD</small><strong>{money(o.subtotal_cents)}</strong></div><div className="order-buttons">
              {o.status==='pending_review'&&<><button className="btn btn-approve btn-small" disabled={busy} onClick={()=>setConfirmAction({order:o,status:'approved'})}><Check size={16}/> Approve</button><button className="btn btn-outline btn-small" disabled={busy} onClick={()=>setConfirmAction({order:o,status:'cancelled'})}>Cancel</button></>}
              {o.status==='approved'&&<><button className="btn btn-primary btn-small" disabled={busy} onClick={()=>setConfirmAction({order:o,status:'fulfilled'})}><PackageCheck size={16}/> Mark fulfilled</button><button className="btn btn-outline btn-small" disabled={busy} onClick={()=>setConfirmAction({order:o,status:'cancelled'})}>Cancel & restock</button></>}
            </div></div>
          </article>)}
          {!visibleOrders.length&&<div className="admin-no-results"><ClipboardList size={25}/><strong>{orders.length?'No matching requests':'No requests yet'}</strong><p>{orders.length?'Try clearing the search or changing the status filter.':'Submitted requests will appear here after account verification.'}</p></div>}
          </div>
        </section>}
      </>}
    </div>
  </div>
  {editing!==null&&<ProductEditor product={editing} close={()=>setEditing(null)} busy={busy} onSave={async payload=>{if(await act('save-product',payload,'Product saved.'))setEditing(null);}}/>}
  {stockItem&&<StockEditor product={stockItem} close={()=>setStockItem(null)} busy={busy} onSave={async payload=>{if(await act('set-stock',payload,'Stock adjustment recorded.'))setStockItem(null);}}/>}
  {manualOpen&&<ManualOrder products={products} busy={busy} close={()=>setManualOpen(false)} onSave={async payload=>{if(await act('manual-order',payload,'Manual order approved and stock deducted.'))setManualOpen(false);}}/>}
  {confirmAction&&<ConfirmOrderAction record={confirmAction} busy={busy} close={()=>setConfirmAction(null)} confirm={async()=>{
    const status=confirmAction.status;
    if (await act('order-status',{order_id:confirmAction.order.id,status},`Request updated to ${ORDER_STATUSES[status]}.`)) setConfirmAction(null);
  }}/>}
  </main>;
}

function Metric({icon:Icon,label,value,foot,accent}) { return <div className="metric"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${accent?'metric-icon-accent':''}`}><Icon size={21}/></span></div><strong>{value}</strong><small>{foot}</small></div>; }

function ConfirmOrderAction({record,busy,close,confirm}) {
  const copy=orderActionDescription(record.order,record.status);
  const modalRef=useAdminDialog(close,busy);
  return <div className="overlay overlay-center" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)close()}}><div className="modal edit-modal admin-confirm-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="rw-order-confirm-title">
    <button type="button" className="round-close modal-x" aria-label="Close confirmation" disabled={busy} onClick={close}><X/></button>
    <div className="admin-confirm-icon"><AlertTriangle size={23}/></div><div className="eyebrow subtle">CONFIRM STATUS CHANGE</div><h2 id="rw-order-confirm-title">{copy.title}</h2><p className="muted">{copy.detail}</p>
    <div className="admin-confirm-summary"><span>{record.order.order_number}</span><strong>{money(record.order.subtotal_cents)}</strong><small>Product subtotal · no payment collected</small></div>
    <div className="admin-confirm-actions"><button className="btn btn-outline" type="button" disabled={busy} onClick={close}>Keep current status</button><button className="btn btn-primary" type="button" disabled={busy} onClick={confirm}>{busy?'Processing…':copy.action}</button></div>
  </div></div>;
}

function ProductEditor({product,close,busy,onSave}) {
  const modalRef=useAdminDialog(close,busy);
  const [f,setF]=useState({id:product.id||null,sku:product.sku||'',name:product.name||'',description:product.description||'',volume_ml:product.volume_ml??30,price:product.price_cents==null?'':(product.price_cents/100).toFixed(2),is_active:product.is_active??false,low_stock_threshold:product.low_stock_threshold??5});
  const set=(key,value)=>setF(c=>({...c,[key]:value}));
  const submit=e=>{e.preventDefault();if(busy)return;onSave({...f,sku:f.sku.trim(),name:f.name.trim(),volume_ml:f.volume_ml===''?null:Number(f.volume_ml),price_cents:f.price===''?null:Math.round(Number(f.price)*100),low_stock_threshold:Number(f.low_stock_threshold)});};
  return <div className="overlay overlay-center" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)close()}}><div className="modal edit-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="rw-edit-product"><button type="button" aria-label="Close editor" disabled={busy} className="round-close modal-x" onClick={close}><X/></button><div className="eyebrow subtle">PRODUCT EDITOR</div><h2 id="rw-edit-product">{product.id?'Edit product':'New product'}</h2>
    <form className="form-stack" onSubmit={submit}><div className="two-col"><Field label="SKU"><input required maxLength={45} value={f.sku} onChange={e=>set('sku',e.target.value)}/></Field><Field label="Volume (mL)"><input type="number" min="1" value={f.volume_ml} onChange={e=>set('volume_ml',e.target.value)}/></Field></div>
    <Field label="Product name"><input required maxLength={130} value={f.name} onChange={e=>set('name',e.target.value)}/></Field><Field label="Description"><textarea rows="3" maxLength={800} value={f.description} onChange={e=>set('description',e.target.value)}/></Field>
    <div className="two-col"><Field label="Price (CAD)"><input type="number" step="0.01" min="0.01" placeholder="Leave blank to hide price" value={f.price} onChange={e=>set('price',e.target.value)}/></Field><Field label="Low-stock threshold"><input type="number" min="0" max="100000" value={f.low_stock_threshold} onChange={e=>set('low_stock_threshold',e.target.value)}/></Field></div>
    <label className="switch-row"><input type="checkbox" checked={f.is_active} onChange={e=>set('is_active',e.target.checked)}/><span><strong>Publish product information</strong><small>Visibility does not guarantee eligibility or fulfillability. Ordering additionally requires price and stock.</small></span></label>
    <button className="btn btn-primary btn-block" disabled={busy}><Save size={17}/> {busy?'Saving…':'Save product'}</button></form>
  </div></div>;
}

function StockEditor({product,close,busy,onSave}) {
  const modalRef=useAdminDialog(close,busy);
  const [quantity,setQuantity]=useState(product.stock_quantity);
  const [reason,setReason]=useState('Stock count adjustment');
  const difference=Number(quantity)-product.stock_quantity;
  const valid=Number.isInteger(Number(quantity)) && Number(quantity)>=0 && Number(quantity)<=1000000 && reason.trim().length>=3 && difference!==0;
  return <div className="overlay overlay-center" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)close()}}><div className="modal edit-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="rw-stock-title"><button type="button" aria-label="Close stock adjustment" disabled={busy} className="round-close modal-x" onClick={close}><X/></button><div className="eyebrow subtle">INVENTORY CONTROL</div><h2 id="rw-stock-title">Adjust available stock</h2><p className="muted">{product.name} · {product.sku}</p>
    <div className="stock-current"><span>Current available units</span><strong>{product.stock_quantity}</strong></div>
    <form className="form-stack" onSubmit={e=>{e.preventDefault();if(valid&&!busy)onSave({product_id:product.id,quantity:Number(quantity),reason:reason.trim()});}}>
      <Field label="New available quantity"><input type="number" min="0" max="1000000" step="1" required value={quantity} onChange={e=>setQuantity(e.target.value)}/></Field>
      <Field label="Reason for adjustment"><input required minLength={3} maxLength={160} value={reason} onChange={e=>setReason(e.target.value)}/></Field>
      <div className="admin-stock-diff"><span>Recorded change</span><strong className={difference>=0?'positive':'negative'}>{Number.isFinite(difference)?`${difference>0?'+':''}${difference} units`:'—'}</strong></div>
      <div className="policy-note"><ClipboardList size={17}/> This adjustment is saved in the audit log. An unchanged quantity is not submitted.</div>
      <button disabled={busy||!valid} className="btn btn-primary btn-block"><Save size={17}/> {busy?'Updating…':'Confirm stock adjustment'}</button>
    </form>
  </div></div>;
}

function ManualOrder({products,busy,close,onSave}) {
  const modalRef=useAdminDialog(close,busy);
  const [name,setName]=useState('');const [email,setEmail]=useState('');
  const [productId,setProductId]=useState(products.find(p=>p.price_cents && p.stock_quantity>0)?.id || products[0]?.id || '');
  const [quantity,setQuantity]=useState(1);const [notes,setNotes]=useState('');const [confirming,setConfirming]=useState(false);
  const selected=products.find(p=>p.id===productId);
  const valid=validManualOrder(selected,quantity);
  function begin(e) {e.preventDefault();if(valid&&!busy)setConfirming(true);}
  function submit() {if(valid&&!busy)onSave({name:name.trim(),email:email.trim(),product_id:productId,quantity:Number(quantity),notes});}
  return <div className="overlay overlay-center" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)close()}}><div className="modal edit-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="rw-manual-title"><button type="button" aria-label="Close manual order" disabled={busy} className="round-close modal-x" onClick={close}><X/></button><div className="eyebrow subtle">PRIVATE ORDER ENTRY</div><h2 id="rw-manual-title">{confirming?'Confirm manual order':'Create manual order'}</h2>
    <p className="muted">Manual orders are recorded as approved immediately and deduct available stock. No payment is collected.</p>
    {!confirming?<form className="form-stack" onSubmit={begin}>
      <Field label="Customer name"><input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></Field>
      <Field label="Customer email"><input type="email" required maxLength={200} value={email} onChange={e=>setEmail(e.target.value)}/></Field>
      <Field label="Product"><select value={productId} required onChange={e=>{setProductId(e.target.value);setQuantity(1)}}>{products.map(p=><option value={p.id} key={p.id}>{p.name} — {money(p.price_cents)} · {p.stock_quantity} available</option>)}</select></Field>
      <Field label="Quantity"><input type="number" min="1" max={Math.min(100,selected?.stock_quantity||100)} step="1" required value={quantity} onChange={e=>setQuantity(e.target.value)}/></Field>
      <Field label="Internal notes"><textarea rows="2" value={notes} maxLength={1000} onChange={e=>setNotes(e.target.value)}/></Field>
      <div className="stock-current"><span>Estimated product subtotal</span><strong>{valid?money(selected.price_cents*Number(quantity)):'—'}</strong></div>
      {!valid&&<p className="admin-inline-warning">Select a priced product with sufficient stock (1–100 whole units).</p>}
      <button className="btn btn-primary btn-block" disabled={busy||!valid}><ArrowRight size={17}/> Review manual order</button>
    </form>:<div className="admin-manual-review"><div className="admin-review-row"><span>Customer</span><strong>{name} · {email}</strong></div><div className="admin-review-row"><span>Product</span><strong>{selected?.name}</strong></div><div className="admin-review-row"><span>Units deducted</span><strong>{quantity}</strong></div><div className="admin-review-row"><span>Subtotal · CAD</span><strong>{money((selected?.price_cents||0)*Number(quantity))}</strong></div>
      <p className="admin-inline-warning"><AlertTriangle size={16}/> This action immediately deducts stock. Confirm authorization and eligibility outside this interface before proceeding.</p>
      <div className="admin-confirm-actions"><button type="button" className="btn btn-outline" disabled={busy} onClick={()=>setConfirming(false)}>Edit details</button><button type="button" className="btn btn-primary" disabled={busy||!valid} onClick={submit}>{busy?'Placing…':'Approve & deduct stock'}</button></div>
    </div>}
  </div></div>;
}

export default AdminPanel;
