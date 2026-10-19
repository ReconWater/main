import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const hero=readFileSync(new URL('../src/HeroExperience.jsx',import.meta.url),'utf8');
test('one Hospira product, three purchase formats, single active hero purchasing panel',()=>{
 assert.match(app,/import HeroExperience from/);
 assert.match(app,/<HeroExperience product=\{product\}/);
 assert.match(hero,/Bacteriostatic Water/);
 assert.match(hero,/30 ML MULTI-DOSE VIAL/);
 assert.match(hero,/Factory-sealed case/);
 assert.match(hero,/10-vial bundle/);
 assert.match(hero,/rw-bac-packages/);
 assert.match(hero,/rw-bac-purchase/);
 assert.doesNotMatch(app+hero,/peptide|tirzepatide|retatrutide/i);
});
test('selected package ID and quantity sent instead of per-product quantity',()=>{
 assert.match(app,/package_id:p\.id,quantity:p\.quantity/);
 assert.match(hero,/formatAvailability/);
 assert.match(hero,/isRequestable/);
 assert.match(hero,/onAdd\(chosen, requested\)/);
 assert.match(app,/React\.lazy/);
});
