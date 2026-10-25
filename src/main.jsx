import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './home-page.css';
import SiteHeader from './SiteHeader';

function Icon({ name, size = 20 }) {
  const common = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:'1.8', strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':'true' };
  const paths = {
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    tag: <><path d="M20.6 13.6 11 23.2 1 13.2V3h10.2l9.4 9.4a.9.9 0 0 1 0 1.2Z"/><circle cx="6.5" cy="8.5" r="1.4"/></>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></>,
    cart: <><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L21 8H7"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function HomePage() {
  return <div className="app-shell home-page">
    <SiteHeader active="home" cartCount={0} cartHref="/products/bacteriostatic-water/" />

    <main>
      <section className="home-hero">
        <div className="container home-hero-grid">
          <div className="home-hero-copy">
            <div className="home-eyebrow"><span/> RECON WATER · CANADA</div>
            <h1>A focused storefront,<br/><em>built to grow.</em></h1>
            <p>Browse the current catalogue, view straightforward pricing, and choose the ordering route that applies to you.</p>
            <div className="home-actions">
              <a className="home-primary" href="/products/">Browse products <Icon name="arrow" size={17}/></a>
              <a className="home-secondary" href="/international/">International orders</a>
            </div>
            <div className="home-meta-row">
              <span>Canadian catalogue</span><i/>
              <span>Separate international ordering</span><i/>
              <span>More products coming</span>
            </div>
          </div>

          <a className="home-feature-card" href="/products/bacteriostatic-water/" aria-label="View Hospira Bacteriostatic Water">
            <div className="home-feature-top"><span>FEATURED PRODUCT</span><b>01</b></div>
            <div className="home-product-stage">
              <div className="home-product-orbit"/>
              <div className="home-product-glow"/>
              <img src="/assets/bac-water-angle.webp" alt="Hospira Bacteriostatic Water 30 mL vial" />
            </div>
            <div className="home-feature-info">
              <div><small>HOSPIRA</small><strong>Bacteriostatic Water</strong><span>30 mL</span></div>
              <b><Icon name="arrow" size={17}/></b>
            </div>
          </a>
        </div>
      </section>

      <section className="home-essentials">
        <div className="container">
          <div className="home-section-head compact">
            <span>THE STOREFRONT</span>
            <h2>Simple where it should be.</h2>
          </div>
          <div className="home-essentials-grid">
            <article><div className="home-icon"><Icon name="grid"/></div><h3>Organized catalogue</h3><p>Products live in a dedicated catalogue so the range can expand without cluttering the homepage.</p></article>
            <article><div className="home-icon"><Icon name="tag"/></div><h3>Pricing upfront</h3><p>Package pricing, promo adjustments and checkout totals are shown before an order is submitted.</p></article>
            <article><div className="home-icon"><Icon name="globe"/></div><h3>Separate markets</h3><p>Canada and international ordering stay separate so each customer sees the relevant pricing and delivery flow.</p></article>
          </div>
        </div>
      </section>

      <section className="home-catalogue">
        <div className="container home-catalogue-grid">
          <div className="home-catalogue-copy">
            <span className="home-kicker">CURRENT CATALOGUE</span>
            <h2>Start with the current product.<br/>Add more without rebuilding the site.</h2>
            <p>Recon Water now uses a catalogue-first structure. Each product has its own page, pricing and checkout experience.</p>
            <a href="/products/">View all products <Icon name="arrow" size={16}/></a>
          </div>

          <a className="home-product-card" href="/products/bacteriostatic-water/">
            <div className="home-product-image">
              <div/>
              <img src="/assets/bac-water-front.webp" alt="Hospira Bacteriostatic Water 30 mL vial" />
              <span>Current catalogue</span>
            </div>
            <div className="home-product-copy">
              <small>HOSPIRA</small>
              <h3>Bacteriostatic Water</h3>
              <p>30 mL vial</p>
              <div><span>View pricing & options</span><strong><Icon name="arrow" size={16}/></strong></div>
            </div>
          </a>
        </div>
      </section>

      <section className="home-ordering">
        <div className="container">
          <div className="home-section-head"><span>ORDERING</span><h2>Two clear paths.</h2><p>Choose the storefront that matches the destination.</p></div>
          <div className="home-ordering-grid">
            <a href="/products/" className="home-order-card">
              <div className="home-order-number">01</div>
              <div><span>CANADA</span><h3>Shop the Canadian catalogue</h3><p>Browse products, package options and CAD checkout pricing.</p></div>
              <b><Icon name="arrow"/></b>
            </a>
            <a href="/international/" className="home-order-card">
              <div className="home-order-number">02</div>
              <div><span>INTERNATIONAL</span><h3>Use the international page</h3><p>View the separate USD ordering and delivery flow.</p></div>
              <b><Icon name="arrow"/></b>
            </a>
          </div>
        </div>
      </section>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<HomePage/>);
