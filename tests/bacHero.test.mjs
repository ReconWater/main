import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const from = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('single product hero focuses only Hospira 30 mL bacteriostatic water', () => {
  const hero = from('src/HeroExperience.jsx');
  assert.match(hero, /Hospira/);
  assert.match(hero, /Bacteriostatic/);
  assert.match(hero, /30 mL/);
  assert.doesNotMatch(hero, /peptide|reconstitution|syringe|role="tablist"|PRODUCT NO\. 01/i);
  assert.match(hero, /SINGLE PRODUCT/);
});

test('hero price, inventory and requests reuse existing Supabase data and cart', () => {
  const hero = from('src/HeroExperience.jsx');
  const app = from('src/App.jsx');
  assert.match(hero, /money\(product\.price_cents\)/);
  assert.match(hero, /maxOrderable\(stock, inCartQty\)/);
  assert.match(hero, /onAdd\(product, chosen\)/);
  assert.match(hero, /disabled=\{!available\}/);
  assert.match(app, /const heroProduct=products\.find/);
  assert.match(app, /<HeroExperience product=\{heroProduct\}/);
});

test('hero does not simulate Hospira packaging without verified photography', () => {
  const hero=from('src/HeroExperience.jsx');
  assert.match(hero, /RECON_PRODUCT_MEDIA\.front/);
  assert.match(hero, /not manufacturer packaging/);
  assert.doesNotMatch(hero, /VialVisual/);
});

test('old hero CSS and interactive tabs are removed, existing background retained', () => {
  assert.match(from('src/App.jsx'), /import HeroExperience from '\.\/HeroExperience'/);
  assert.doesNotMatch(from('src/App.jsx'), /function HomepageHero/);
  assert.doesNotMatch(from('src/styles.css'), /\.rw-hero-stage/);
  assert.doesNotMatch(from('src/hero.css'), /rw-bac-tabs|rw-bac-tab-panel/);
  assert.match(from('src/hero.css'), /recon-water-background-4k.webp/);
  assert.ok(existsSync(new URL('../public/recon-water-background-4k.webp', import.meta.url)));
});
