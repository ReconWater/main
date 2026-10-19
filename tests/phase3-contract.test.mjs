import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url),'utf8');

test('admin route is asynchronously imported without bundling admin code into the storefront entry', () => {
  const app=read('src/App.jsx');
  const admin=read('src/AdminPanel.jsx');
  assert.match(app, /React\.lazy\(\(\) => import\('\.\/AdminPanel\.jsx'\)\)/);
  assert.doesNotMatch(app,/function AdminPanel\(/);
  assert.match(admin,/import '\.\/admin\.css';/);
  assert.match(admin,/function AdminPanel\(/);
  assert.match(admin,/export default AdminPanel/);
});

test('only the lazy admin bundle imports route-specific admin styling', () => {
  const app=read('src/styles.css');
  const admin=read('src/admin.css');
  assert.doesNotMatch(app,/\.admin-shell\{/);
  assert.match(admin,/\.admin-shell\{/);
  assert.match(admin,/@media \(max-width:760px\)/);
});

test('no CSS font @import waterfall; font resource hints are in HTML', () => {
  assert.doesNotMatch(read('src/styles.css'),/@import/);
  const html=read('index.html');
  assert.match(html,/rel="preconnect" href="https:\/\/fonts\.gstatic\.com"/);
  assert.match(html,/display=swap/);
});

test('hashed bundles cache immutably, HTML shell revalidates', () => {
  const netlify=read('netlify.toml');
  assert.match(netlify,/for = "\/assets\/\*"[\s\S]*?immutable/);
  assert.match(netlify,/for = "\/index\.html"[\s\S]*?must-revalidate/);
});

test('product modal keyboard focus and reduced-motion navigation remain accessible', () => {
  assert.match(read('src/ProductExperience.jsx'),/lightboxCloseRef\.current\?\.focus\(\)/);
  assert.match(read('src/ProductExperience.jsx'),/document\.body\.style\.overflow='hidden'/);
  assert.match(read('src/App.jsx'),/prefers-reduced-motion: reduce/);
  assert.match(read('src/App.jsx'),/Skip to content/);
});
