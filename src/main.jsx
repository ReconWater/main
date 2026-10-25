import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './home-page.css';
import SiteHeader from './SiteHeader';

function ArrowIcon({ size = 17 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>;
}

function HomePage() {
  return <div className="app-shell home-page">
    <SiteHeader active="home" cartCount={0} cartHref="/products/bacteriostatic-water/" />

    <main>
      <section className="home-hero">
        <div className="container home-hero-grid">
          <div className="home-hero-copy">
            <div className="home-eyebrow"><span/> RECON WATER · CANADA</div>
            <h1>Simple.<br/><em>Focused.</em></h1>
            <p>A streamlined storefront for browsing current products and choosing the ordering option that applies to you.</p>
            <div className="home-actions">
              <a className="home-primary" href="/products/">Browse products <ArrowIcon /></a>
              <a className="home-secondary" href="/international/">International orders</a>
            </div>
          </div>

          <a className="home-feature-card" href="/products/bacteriostatic-water/" aria-label="View Hospira Bacteriostatic Water">
            <div className="home-feature-label">CURRENT PRODUCT</div>
            <div className="home-product-stage">
              <div className="home-product-glow"/>
              <img src="/assets/bac-water-angle.webp" alt="Hospira Bacteriostatic Water 30 mL vial" />
            </div>
            <div className="home-feature-info">
              <small>HOSPIRA</small>
              <strong>Bacteriostatic Water</strong>
              <span>30 mL</span>
              <b>View product <ArrowIcon size={15}/></b>
            </div>
          </a>
        </div>
      </section>

      <section className="home-shortcuts">
        <div className="container home-shortcuts-grid">
          <a href="/products/" className="home-shortcut">
            <div><span>CATALOGUE</span><strong>Products</strong><p>Browse the current product range.</p></div>
            <b><ArrowIcon /></b>
          </a>
          <a href="/international/" className="home-shortcut">
            <div><span>OUTSIDE CANADA</span><strong>International</strong><p>View the separate international ordering page.</p></div>
            <b><ArrowIcon /></b>
          </a>
        </div>
      </section>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<HomePage/>);
