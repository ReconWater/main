import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('single product hero mounts clinical image gallery and native package radios',()=>{
 const app=read('src/App.jsx');
 assert.match(app,/<ClinicalGallery\s*\/>/);
 assert.match(app,/<input type="radio" name="clinical-package"/);
 assert.match(app,/chosen\?\.id===p.id/);
 assert.doesNotMatch(app,/<ProductVisual/);
});
test('legacy product pricing gallery is not imported; checkout transmits package IDs',()=>{
 const app=read('src/App.jsx');
 assert.doesNotMatch(app,/import ProductExperience/);
 assert.match(app,/package_id:p\.id,quantity:p\.quantity/);
});
test('gallery has user-supplied image slots, modal keyboard controls and factual placeholder',()=>{
 const gallery=read('src/ClinicalGallery.jsx');
 assert.match(gallery,/RECON_PRODUCT_MEDIA/);
 assert.match(gallery,/e\.key==='Escape'/);
 assert.match(gallery,/e\.key==='Tab'/);
 assert.match(gallery,/not product packaging/);
});
test('Netlify and admin share same eligible lot stock availability routine',()=>{
 assert.match(read('netlify/functions/api.mjs'),/packageAvailability\(/);
 assert.match(read('src/AdminPanel.jsx'),/info\?\.packageAvailability/);
 assert.doesNotMatch(read('src/AdminPanel.jsx'),/Math\.floor\(loose\/p\.vials_per_pack\)/);
});
