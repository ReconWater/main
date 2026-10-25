import React, { useState } from 'react';
import './site-header.css';

function CartIcon({ size = 19 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.5h7.9a2 2 0 0 0 1.9-1.4L21 7H6"/></svg>;
}

function Chevron() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>;
}

export default function SiteHeader({ active = 'home', cartCount = 0, onCartClick, cartHref = '/?cart=open' }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);
  const activeClass = key => active === key ? 'is-active' : '';

  const cartControl = onCartClick
    ? <button type="button" className="rw-cart" onClick={onCartClick} aria-label={`Open cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}><CartIcon/><span>Cart</span><b>{cartCount}</b></button>
    : <a className="rw-cart" href={cartHref} aria-label={`Open cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}><CartIcon/><span>Cart</span><b>{cartCount}</b></a>;

  return <>
    <header className="rw-header">
      <div className="container rw-header-inner">
        <a className="rw-brand" href="/" aria-label="Recon Water home">
          <img src="/assets/recon-water-logo.webp" alt="Recon Water" />
        </a>

        <nav className="rw-desktop-nav" aria-label="Primary navigation">
          <a className={activeClass('home')} href="/" aria-current={active === 'home' ? 'page' : undefined}>Home</a>
          <div className={`rw-products-nav ${activeClass('products')}`}>
            <a href="/products/" aria-current={active === 'products' ? 'page' : undefined}>Products</a>
            <span className="rw-nav-chevron"><Chevron/></span>
            <div className="rw-products-menu" role="group" aria-label="Products">
              <div className="rw-products-menu-head"><span>CATALOGUE</span><small>Canadian supply</small></div>
              <a className="rw-product-menu-item" href="/products/bacteriostatic-water/">
                <span className="rw-product-menu-thumb"><img src="/assets/bac-water-front.webp" alt="" /></span>
                <span><b>Bacteriostatic Water</b><small>Hospira / Pfizer · 30 mL</small></span>
                <i>→</i>
              </a>
              <a className="rw-view-all" href="/products/"><span>View all products</span><i>→</i></a>
            </div>
          </div>
          <a className={activeClass('international')} href="/international/" aria-current={active === 'international' ? 'page' : undefined}>International</a>
        </nav>

        <div className="rw-header-actions">
          {cartControl}
          <button type="button" className="rw-menu-toggle" onClick={() => setMobileOpen(open => !open)} aria-expanded={mobileOpen} aria-controls="rw-mobile-menu" aria-label="Toggle navigation">
            <span/><span/><span/>
          </button>
        </div>
      </div>
    </header>

    <div id="rw-mobile-menu" className={`rw-mobile-menu ${mobileOpen ? 'open' : ''}`} aria-hidden={!mobileOpen}>
      <button type="button" className="rw-mobile-scrim" aria-label="Close navigation" onClick={closeMobile}/>
      <div className="rw-mobile-panel">
        <div className="rw-mobile-panel-head"><span>Navigation</span><button type="button" onClick={closeMobile} aria-label="Close navigation">×</button></div>
        <nav aria-label="Mobile navigation">
          <a className={activeClass('home')} href="/" onClick={closeMobile}><span>Home</span><i>01</i></a>
          <a className={activeClass('products')} href="/products/" onClick={closeMobile}><span>Products</span><i>02</i></a>
          <a className="rw-mobile-sub" href="/products/bacteriostatic-water/" onClick={closeMobile}><span>Bacteriostatic Water · 30 mL</span><i>→</i></a>
          <a className={activeClass('international')} href="/international/" onClick={closeMobile}><span>International</span><i>03</i></a>
          <a className="rw-mobile-cart" href={cartHref} onClick={closeMobile}><span><CartIcon/> Cart</span><b>{cartCount}</b></a>
        </nav>
      </div>
    </div>
  </>;
}
