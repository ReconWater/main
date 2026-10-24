import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const hero = readFileSync(new URL('../src/HeroExperience.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/hero.css', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../supabase/003_packaging_and_lots.sql', import.meta.url), 'utf8');

test('App actively renders the original branded hero, not the V5 placeholder hero',()=>{
 assert.match(app, /import HeroExperience from '\.\/HeroExperience'/);
 assert.match(app, /<HeroExperience product=\{product\} packages=\{packages\}/);
 assert.doesNotMatch(app, /<section id="product" className="product-hero"/);
});
test('Hero supports single, ten, sealed case from live package records',()=>{
 assert.match(hero, /packages\.map\(/);
 assert.match(hero, /formatAvailability\(chosen, cart, stock\)/);
 assert.match(hero, /isRequestable\(chosen, \{ remaining \}\)/);
 assert.match(hero, /onAdd\(chosen, requested\)/);
 assert.match(hero, /Factory-sealed case/);
 assert.match(hero, /rw-bac-background/);
 assert.match(css, /recon-water-background-4k\.webp/);
});
test('V5 stock and order functions remain in uploaded SQL, unchanged by restoration',()=>{
 assert.match(sql, /service_submit_order_v2/);
 assert.match(sql, /service_admin_order_transition_v2/);
 assert.match(sql, /service_admin_open_case_v2/);
});
