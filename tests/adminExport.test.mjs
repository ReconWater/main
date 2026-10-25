import test from 'node:test';
import assert from 'node:assert/strict';
import {ordersCsv} from '../src/adminExport.js';
test('CSV includes package, vial and payment fields',()=>{
 const csv=ordersCsv([{order_number:'RW-123',created_at:'2026-10-19T22:00:00Z',status:'approved',customer_name:'Jane, Doe',customer_email:'jane@example.com',subtotal_cents:60000,payment_method:'etransfer',payment_status:'awaiting_payment',payment_currency:'CAD',payment_amount_cents:60000,payment_reference:'RW-123',order_items:[{sku:'RW-BAC-10',package_label:'10-vial pack',quantity:2,vials_per_pack:10,unit_price_cents:30000}]}]);
 assert.match(csv,/"Jane, Doe"/);
 assert.match(csv,/"RW-BAC-10","10-vial pack","2","10","20","CAD","300.00","600.00"/);
 assert.match(csv,/"etransfer","awaiting_payment","CAD","600.00","RW-123"/);
});
test('CSV avoids basic spreadsheet formula injection',()=>{
 const csv=ordersCsv([{order_number:'x',created_at:'',status:'',customer_name:'=WEBSERVICE("x")',customer_email:'=1+1',order_items:[{sku:'A',package_label:'S',quantity:1,vials_per_pack:1,unit_price_cents:100}]}]);
 assert.match(csv,/"'=WEBSERVICE/);
 assert.match(csv,/"'=1\+1"/);
});
