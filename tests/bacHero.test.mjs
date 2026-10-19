import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const text=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
test('one Hospira product with three formats, same single purchase panel',()=>{
 assert.match(text,/Bacteriostatic Water/);
 assert.match(text,/30 mL multi-dose vial/);
 assert.match(text,/factory-sealed case/i);
 assert.match(text,/Assembled 10-vial bundle/i);
 assert.match(text,/format-grid/);
 assert.match(text,/purchase-box/);
 assert.doesNotMatch(text,/peptide|tirzepatide|retatrutide/i);
});
test('selected package ID and quantity sent instead of per-product quantity',()=>{
 assert.match(text,/package_id:p\.id,quantity:p\.quantity/);
 assert.match(text,/formatAvailability/);
 assert.match(text,/isRequestable/);
 assert.match(text,/React\.lazy/);
});
