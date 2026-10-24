import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('src/App.jsx'), css=read('src/styles.css'), hero=read('src/clinical-hero.css');

test('product-led homepage has no redundant marketing sections or navigation',()=>{
  assert.match(app,/<MainShop/);
  for(const id of ['credibility-strip','process-grid','faq-stack','content-section','clinical-specs'])
    assert.doesNotMatch(app,new RegExp(id));
  assert.doesNotMatch(app,/navClick\('faq'\)|navClick\('process'\)/);
  assert.doesNotMatch(css,/\.process-grid\{|\.credibility-strip\{|\.faq-stack\{/);
});
test('package cards, computed total and disclosures remain controlled by React state',()=>{
  assert.match(app,/useState\(null\)/);
  assert.match(app,/setSelected\(p\.id\);setPackQty\(1\)/);
  assert.match(app,/chosen\.price_cents\*amount/);
  assert.match(app,/aria-live="polite"/);
  assert.match(app,/aria-expanded=\{expanded==='specs'\}/);
  assert.match(app,/aria-expanded=\{expanded==='requests'\}/);
  assert.match(app,/onAdd\(chosen,amount\)/);
});
test('no database, API, pricing or inventory migrations are required',()=>{
  assert.match(read('src/packaging.js'),/formatAvailability/);
  assert.match(app,/callApi\('submit-order'/);
  assert.match(hero,/prefers-reduced-motion/);
});
