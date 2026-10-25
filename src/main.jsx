import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './home-page.css';
import SiteHeader from './SiteHeader';

function Icon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' };
  const paths = {
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    box: <><path d="m21 8-9 5-9-5"/><path d="M3 8l9-5 9 5v8l-9 5-9-5Z"/><path d="M12 13v8"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    leaf: <><path d="M12 21V8"/><path d="M12 13C8 13 5 10 5 6c4 0 7 3 7 7Z"/><path d="M12 16c4 0 7-3 7-7-4 0-7 3-7 7Z"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function HomePage() {
  return <div className="app-shell home-page">
    <div className="trustbar"><div className="container trustbar-inner">
      <span><Icon name="leaf" size={14}/> Canadian storefront</span><span className="trustbar-sep">•</span>
      <span><Icon name="shield" size={14}/> Clear product identification</span><span className="trustbar-sep">•</span>
      <span><Icon name="globe" size={14}/> Canada & international ordering</span>
    </div></div>

    <SiteHeader active="home" cartCount={0} cartHref="/products/bacteriostatic-water/" />

    <main>
      <section className="home-hero"><div className="container home-hero-grid">
        <div className="home-hero-copy">
          <div className="home-eyebrow"><span/> RECON WATER · CANADA</div>
          <h1>Medical supply,<br/><em>presented clearly.</em></h1>
          <p>Recon Water is a focused Canadian storefront built around transparent product information, straightforward ordering and carefully managed inventory.</p>
          <div className="home-actions">
            <a className="home-primary" href="/products/">Browse products <Icon name="arrow" size={17}/></a>
            <a className="home-secondary" href="/international/">International orders</a>
          </div>
          <div className="home-proof-row">
            <span><Icon name="shield" size={16}/> Product identity upfront</span>
            <span><Icon name="calendar" size={16}/> Current expiry visibility</span>
            <span><Icon name="box" size={16}/> Package-level inventory</span>
          </div>
        </div>

        <div className="home-visual" aria-label="Featured Recon Water product">
          <div className="home-visual-orbit home-visual-orbit-one"/>
          <div className="home-visual-orbit home-visual-orbit-two"/>
          <div className="home-feature-card">
            <div className="home-feature-meta"><span>FEATURED PRODUCT</span><b>01</b></div>
            <img src="/assets/bac-water-angle.webp" alt="Hospira Bacteriostatic Water for Injection USP 30 mL vial" />
            <div className="home-feature-info">
              <small>HOSPIRA / PFIZER CANADA</small>
              <strong>Bacteriostatic Water</strong>
              <span>30 mL · DIN 00038202</span>
            </div>
          </div>
        </div>
      </div></section>

      <section className="home-intro"><div className="container">
        <div className="home-section-heading"><span>HOW RECON WATER IS BUILT</span><h2>Useful information first.<br/>Everything else second.</h2><p>The storefront is designed to make product identity, packaging, availability and ordering terms easy to understand before a customer commits.</p></div>
        <div className="home-principles">
          <article><div className="home-principle-icon"><Icon name="shield"/></div><span>01</span><h3>Clear product identity</h3><p>Manufacturer, DIN, format and key product information are kept visible where customers actually make decisions.</p></article>
          <article><div className="home-principle-icon"><Icon name="calendar"/></div><span>02</span><h3>Inventory transparency</h3><p>Current availability and inventory expiry can be referenced directly from the product experience rather than hidden in support messages.</p></article>
          <article><div className="home-principle-icon"><Icon name="globe"/></div><span>03</span><h3>Separate market flows</h3><p>Canadian and international ordering stay distinct so pricing, delivery and payment information remain clear for each market.</p></article>
        </div>
      </div></section>

      <section className="home-catalogue-preview"><div className="container home-catalogue-grid">
        <div className="home-catalogue-copy">
          <span className="home-kicker">CURRENT CATALOGUE</span>
          <h2>A focused catalogue<br/>with room to grow.</h2>
          <p>Products live in their own catalogue and product pages, keeping the homepage clean while making it easy to expand the range over time.</p>
          <a href="/products/">View product catalogue <Icon name="arrow" size={16}/></a>
        </div>
        <a className="home-product-card" href="/products/bacteriostatic-water/">
          <div className="home-product-image"><div/><img src="/assets/bac-water-front.webp" alt="Hospira Bacteriostatic Water for Injection USP"/><span><i/> Available</span></div>
          <div className="home-product-copy"><small>HOSPIRA / PFIZER CANADA</small><h3>Bacteriostatic Water</h3><p>30 mL multidose vial · DIN 00038202</p><div><span>Canadian product page</span><strong>View product <Icon name="arrow" size={15}/></strong></div></div>
        </a>
      </div></section>

      <section className="home-market-section"><div className="container">
        <div className="home-market-head"><span>ORDERING</span><h2>Choose the market that applies to you.</h2></div>
        <div className="home-market-grid">
          <a href="/products/" className="home-market-card"><div><span>CANADA</span><h3>Canadian catalogue</h3><p>Browse products and Canadian package options priced in CAD.</p></div><b><Icon name="arrow"/></b></a>
          <a href="/international/" className="home-market-card"><div><span>INTERNATIONAL</span><h3>International orders</h3><p>A separate USD ordering flow with its own quantity and delivery terms.</p></div><b><Icon name="arrow"/></b></a>
        </div>
      </div></section>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<HomePage/>);
