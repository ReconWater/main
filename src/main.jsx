import React, {useMemo, useState} from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const PRODUCT_IMAGES = [
  {
    src: '/assets/bac-water-front.webp',
    alt: 'Bacteriostatic Water for Injection USP 30 mL vial front view',
    label: 'Front'
  },
  {
    src: '/assets/bac-water-angle.webp',
    alt: 'Bacteriostatic Water for Injection USP 30 mL vial angled view',
    label: 'Angled'
  }
];

const PACKS = [
  { id: 'single', label: 'Single vial', qty: 1, price: 15, note: '$15.00 / vial' },
  { id: 'five', label: '5 vials', qty: 5, price: 70, note: '$14.00 / vial' },
  { id: 'ten', label: '10 vials', qty: 10, price: 130, note: '$13.00 / vial', badge: 'Popular' },
  { id: 'case', label: 'Factory case', qty: 25, price: 300, note: '$12.00 / vial', badge: 'Best value' }
];

function Icon({name, size=20}) {
  const common = {width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:'1.8',strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':'true'};
  const paths = {
    cart: <><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.5h7.9a2 2 0 0 0 1.9-1.4L21 7H6"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    truck: <><path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    minus: <path d="M5 12h14"/>,
    box: <><path d="m21 8-9 5-9-5"/><path d="M3 8l9-5 9 5v8l-9 5-9-5Z"/><path d="M12 13v8"/></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></>,
    leaf: <><path d="M12 21V8"/><path d="M12 13C8 13 5 10 5 6c4 0 7 3 7 7Z"/><path d="M12 16c4 0 7-3 7-7-4 0-7 3-7 7Z"/></>
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function App(){
  const [selectedPack, setSelectedPack] = useState(PACKS[0]);
  const [selectedImage, setSelectedImage] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState(null);
  const [faq, setFaq] = useState(0);

  const unit = useMemo(() => selectedPack.price / selectedPack.qty, [selectedPack]);
  const addToCart = () => { setCart(selectedPack); setCartOpen(true); };

  return <div className="app-shell">
    <div className="trustbar">
      <div className="container trustbar-inner">
        <span><Icon name="leaf" size={14}/> Canadian storefront</span>
        <span className="trustbar-sep">•</span>
        <span><Icon name="shield" size={14}/> DIN-labelled product</span>
        <span className="trustbar-sep">•</span>
        <span><Icon name="truck" size={15}/> Canada-wide fulfilment</span>
      </div>
    </div>

    <header className="site-header">
      <div className="container nav-wrap">
        <a className="brand brand-logo-link" href="#top" aria-label="Recon Water home">
          <img className="brand-logo" src="/assets/recon-water-logo.webp" alt="Recon Water" />
        </a>
        <nav className="desktop-nav" aria-label="Primary">
          <a href="#product">Product</a>
          <a href="#why">Why us</a>
          <a href="#shipping">Shipping</a>
          <a href="#faq">FAQ</a>
        </nav>
        <button className="cart-trigger" onClick={()=>setCartOpen(true)} aria-label="Open cart">
          <Icon name="cart" /> <span>Cart</span><b>{cart?.qty || 0}</b>
        </button>
      </div>
    </header>

    <main id="top">
      <section className="product-hero" id="product">
        <div className="container hero-grid">
          <div className="gallery-column">
            <div className="gallery-kicker">HOSPIRA / PFIZER CANADA</div>
            <div className="product-stage">
              <div className="stage-aura"/>
              <img src={PRODUCT_IMAGES[selectedImage].src} alt={PRODUCT_IMAGES[selectedImage].alt} className="product-image"/>
              <div className="stage-badge"><Icon name="shield" size={16}/><span><b>DIN 00038202</b><small>Marketed in Canada</small></span></div>
            </div>
            <div className="thumb-row">
              {PRODUCT_IMAGES.map((img,index)=><button key={img.src} onClick={()=>setSelectedImage(index)} className={`thumb ${selectedImage===index?'active':''}`}>
                <img src={img.src} alt=""/><span>{img.label}</span>
              </button>)}
              <div className="thumb-spec"><span>30</span><small>mL</small></div>
            </div>
            <p className="image-note">Product imagery based on the current supplied vial and label reference.</p>
          </div>

          <div className="purchase-column">
            <div className="eyebrow"><span/> Canadian medical supply</div>
            <h1>Bacteriostatic Water<br/><em>for Injection USP</em></h1>
            <p className="subline">30 mL multidose vial · DIN 00038202 · Pfizer Canada ULC</p>

            <div className="hero-price-row">
              <div><span>From</span><strong>${Math.min(...PACKS.map(p=>p.price)).toFixed(2)} <small>CAD</small></strong></div>
              <div className="stock"><i/> In stock</div>
            </div>

            <div className="divider"/>
            <div className="pack-label"><span>Choose quantity</span><b>{selectedPack.label}</b></div>
            <div className="pack-grid">
              {PACKS.map(pack=><button key={pack.id} onClick={()=>setSelectedPack(pack)} className={`pack-card ${selectedPack.id===pack.id?'selected':''}`}>
                {pack.badge && <span className="pack-badge">{pack.badge}</span>}
                <span className="radio-dot"><i/></span>
                <b>{pack.label}</b>
                <strong>${pack.price.toFixed(2)}</strong>
                <small>{pack.note}</small>
              </button>)}
            </div>

            <div className="selected-total">
              <div><span>Your selection</span><b>{selectedPack.qty} {selectedPack.qty===1?'vial':'vials'}</b></div>
              <div className="selected-price"><strong>${selectedPack.price.toFixed(2)}</strong><small>CAD · ${unit.toFixed(2)} / vial</small></div>
            </div>

            <button className="primary-atc" onClick={addToCart}><Icon name="cart"/> Add to cart <span>${selectedPack.price.toFixed(2)} CAD</span></button>
            <div className="micro-trust">
              <span><Icon name="lock" size={16}/> Secure checkout</span>
              <span><Icon name="box" size={16}/> Protective packaging</span>
              <span><Icon name="shield" size={16}/> DIN verified</span>
            </div>
            <div className="product-note"><Icon name="info" size={18}/><p>Product and order information only. Use and handling should follow the manufacturer’s labelling and applicable professional guidance.</p></div>
          </div>
        </div>
      </section>

      <section className="value-strip" id="why">
        <div className="container value-grid">
          <article><Icon name="shield"/><div><b>Verified product identity</b><p>DIN, manufacturer and format are visible before purchase.</p></div></article>
          <article><Icon name="box"/><div><b>Built for a single product</b><p>No catalogue noise. Everything revolves around the 30 mL vial.</p></div></article>
          <article><Icon name="truck"/><div><b>Canadian fulfilment</b><p>Clear shipping expectations without burying details in a policy page.</p></div></article>
        </div>
      </section>

      <section className="shipping-section" id="shipping">
        <div className="container shipping-shell">
          <div className="shipping-copy"><span className="section-tag light">FULFILMENT</span><h2>Shipping that reads like an answer, not a policy manual.</h2><p>Keep the checkout promise simple. Show the rate and estimated handling window directly in the purchase flow once your final carrier rules are confirmed.</p></div>
          <div className="shipping-cards">
            <div><Icon name="truck"/><span>Domestic shipping</span><b>Canada-wide</b><small>Final rates calculated at checkout.</small></div>
            <div><Icon name="box"/><span>Packaging</span><b>Protective</b><small>Packaged to reduce transit damage.</small></div>
            <div><Icon name="check"/><span>Order updates</span><b>Tracked</b><small>Confirmation and shipment status by email.</small></div>
          </div>
        </div>
      </section>

      <section className="faq-section" id="faq">
        <div className="container faq-grid">
          <div><span className="section-tag">FAQ</span><h2>Common questions</h2><p>Short, useful answers instead of several pages of repetitive copy.</p></div>
          <div className="faq-list">
            {[
              ['What exactly is being sold?','Bacteriostatic Water for Injection USP in a 30 mL multidose vial. The product record displayed on the site is DIN 00038202.'],
              ['Who manufactures it?','The Canadian Drug Product Database lists Pfizer Canada ULC for DIN 00038202. Hospira branding may appear on the physical vial and packaging.'],
              ['Can I purchase larger quantities?','The interface supports single vials and multi-vial quantities. Business or wholesale orders can be routed through a separate inquiry workflow if required.'],
              ['What is your return policy?','Because this is a medical product, the final return policy should reflect applicable law, product integrity requirements, and your operating procedures.']
            ].map((item,index)=><div className={`faq-item ${faq===index?'open':''}`} key={item[0]}>
              <button onClick={()=>setFaq(faq===index?-1:index)}><span>{item[0]}</span><Icon name={faq===index?'minus':'plus'} size={18}/></button>
              <div className="faq-answer"><p>{item[1]}</p></div>
            </div>)}
          </div>
        </div>
      </section>

      <section className="support-cta">
        <div className="container support-inner"><div><span>Need help with an order?</span><h2>Canadian customer support.</h2></div><a href="mailto:support@example.ca">Contact support <Icon name="chevron" size={17}/></a></div>
      </section>
    </main>

    <footer>
      <div className="container footer-top"><div className="footer-brand"><a className="brand footer-logo-link" href="#top" aria-label="Recon Water home"><img className="footer-logo" src="/assets/recon-water-logo.webp" alt="Recon Water" /></a><p>A focused Canadian storefront for bacteriostatic water.</p></div><div><b>Shop</b><a href="#product">30 mL vial</a><a href="#product">Quantity pricing</a></div><div><b>Information</b><a href="#why">Product details</a><a href="#shipping">Shipping</a><a href="#faq">FAQ</a></div><div><b>Legal</b><a href="#">Terms</a><a href="#">Privacy</a><a href="#">Returns</a></div></div>
      <div className="container footer-bottom"><span>© 2026 Recon Water</span><span>Product sales subject to applicable Canadian laws and regulations.</span></div>
    </footer>

    <div className={`cart-drawer ${cartOpen?'open':''}`} aria-hidden={!cartOpen}>
      <button className="cart-scrim" onClick={()=>setCartOpen(false)} aria-label="Close cart"/>
      <aside className="cart-panel">
        <div className="cart-head"><div><span>Your cart</span><small>{cart?`${cart.qty} ${cart.qty===1?'vial':'vials'}`:'Empty'}</small></div><button onClick={()=>setCartOpen(false)}>×</button></div>
        {!cart ? <div className="empty-cart"><Icon name="cart" size={28}/><h3>Your cart is empty</h3><p>Select a quantity and add it to your cart.</p></div> : <>
          <div className="cart-product"><div className="cart-image"><img src={PRODUCT_IMAGES[0].src} alt="Hospira Bacteriostatic Water vial"/></div><div><b>Bacteriostatic Water for Injection USP</b><span>30 mL · {cart.label}</span><strong>${cart.price.toFixed(2)} CAD</strong></div></div>
          <div className="cart-summary"><div><span>Subtotal</span><b>${cart.price.toFixed(2)} CAD</b></div><p>Shipping and applicable taxes calculated at checkout.</p></div>
          <button className="checkout-button">Continue to checkout <Icon name="chevron" size={17}/></button>
          <p className="checkout-disclaimer">Connect this button to your approved payment and order workflow before launch.</p>
        </>}
      </aside>
    </div>

    <div className="mobile-atc"><div><small>{selectedPack.label}</small><b>${selectedPack.price.toFixed(2)} CAD</b></div><button onClick={addToCart}>Add to cart</button></div>
  </div>
}

createRoot(document.getElementById('root')).render(<App/>);
