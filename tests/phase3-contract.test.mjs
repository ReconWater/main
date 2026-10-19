import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('storefront lazy-loads admin and uses one font family with motion alternatives',()=>{
 assert.match(read('src/App.jsx'),/React\.lazy\(\(\)=>import\('\.\/AdminPanel\.jsx'\)\)/);
 assert.match(read('index.html'),/Manrope/);
 assert.doesNotMatch(read('index.html'),/DM\+Serif/);
 assert.match(read('src/styles.css'),/prefers-reduced-motion/);
});
test('server keeps historical prices and variants server-authoritative',()=>{
 const sql=read('supabase/003_packaging_and_lots.sql');
 assert.match(sql,/v_pack\.price_cents/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/inventory_lots/);
 assert.match(sql,/order_allocations_v2/);
});
