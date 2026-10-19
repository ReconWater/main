import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('admin has package pricing, lot receiving, release, case opening and order transitions',()=>{
 const admin=read('src/AdminPanel.jsx');
 for(const action of ['save-package','receive-lot','update-lot','adjust-lot','open-case','manual-order','order-status']) assert.ok(admin.includes(action),action);
 assert.match(admin,/case opened/);
});
test('old stock mutations are revoked at migration and API has no old mutation routes',()=>{
 const sql=read('supabase/003_packaging_and_lots.sql');
 const api=read('netlify/functions/api.mjs');
 assert.match(sql,/REVOKE EXECUTE ON FUNCTION public\.service_admin_set_stock/);
 assert.doesNotMatch(api,/service_admin_set_stock\b/);
 assert.match(api,/service_submit_order_v2/);
 assert.match(api,/auth\.getUser/);
});
