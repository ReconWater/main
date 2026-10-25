import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './products-page.css';
import SiteHeader from './SiteHeader';

const PRODUCTS = [
  {
    id: 'bac-water-30ml',
    name: 'Bacteriostatic Water for Injection USP',
    shortName: 'Bacteriostatic Water',
    maker: 'Hospira / Pfizer Canada',
    detail: '30 mL multidose vial',
    din: 'DIN 00038202',
    from: '$15.00 CAD',
    image: '/assets/bac-water-front.webp',
    href: '/#product',
    status: 'Available',
  },
];

function Arrow() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>;
}

function ProductsPage() {
  return <div className="app-shell products-page">
    <div className="trustbar"><div className="container trustbar-inner"><span>Recon Water catalogue</span><span className="trustbar-sep">•</span><span>Canadian pricing in CAD</span><span className="trustbar-sep">•</span><span>International ordering available separately</span></div></div>
    <SiteHeader active="products" cartCount={0} cartHref="/" />

    <main>
      <section className="catalogue-hero"><div className="container">
        <div className="catalogue-eyebrow">PRODUCT CATALOGUE</div>
        <div className="catalogue-hero-row"><div><h1>Products, presented with<br/><em>clinical clarity.</em></h1><p>A focused catalogue of medical-supply products with transparent formats, pricing and availability.</p></div><div className="catalogue-count"><strong>{String(PRODUCTS.length).padStart(2,'0')}</strong><span>Current product{PRODUCTS.length === 1 ? '' : 's'}</span></div></div>
      </div></section>

      <section className="catalogue-section"><div className="container">
        <div className="catalogue-toolbar"><div><span>All products</span><b>{PRODUCTS.length}</b></div><a href="/international/">International orders <Arrow/></a></div>
        <div className="catalogue-grid">
          {PRODUCTS.map(product => <article className="catalogue-card" key={product.id}>
            <a className="catalogue-image" href={product.href} aria-label={`View ${product.name}`}><div className="catalogue-aura"/><img src={product.image} alt={`${product.name} ${product.detail}`} /><span className="catalogue-status"><i/>{product.status}</span></a>
            <div className="catalogue-card-body">
              <div className="catalogue-maker">{product.maker}</div>
              <h2>{product.shortName}</h2>
              <p>{product.detail} · {product.din}</p>
              <div className="catalogue-card-footer"><div><span>From</span><strong>{product.from}</strong></div><a href={product.href}>View product <Arrow/></a></div>
            </div>
          </article>)}
        </div>
      </div></section>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<ProductsPage/>);
