import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
test('admin confirmation is required for stock-mutating status transitions',()=>{
  const code=read('src/AdminPanel.jsx');
  assert.match(code,/setConfirmAction\(\{order:o,status:'approved'\}\)/);
  assert.match(code,/setConfirmAction\(\{order:o,status:'cancelled'\}\)/);
  assert.match(code,/function ConfirmOrderAction/);
  assert.match(code,/await act\('order-status'/);
});
test('admin modal keyboard trap and Escape close are available',()=>{
  const code=read('src/AdminPanel.jsx');
  assert.match(code,/event\.key==='Escape'/);
  assert.match(code,/event\.key!=='Tab'/);
  assert.match(code,/previous\?\.focus\?\.\(\)/);
  assert.match(code,/aria-modal="true"/);
});
test('Netlify API + Supabase SQL operations are untouched by phase 4',()=>{
  const code=read('src/AdminPanel.jsx');
  assert.match(code,/callApi\('dashboard'/);
  assert.match(code,/callApi\(action,session,payload\)/);
  assert.doesNotMatch(code,/SUPABASE_SERVICE_ROLE_KEY/);
});
test('read-only production smoke tool tests protected API without sending credentials',()=>{
  const script=read('scripts/smoke.mjs');
  assert.match(script,/api\?action=dashboard/);
  assert.match(script,/api\.status===401/);
  assert.doesNotMatch(script,/submit-order|manual-order|set-stock/);
});
