import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDashboard, filterOrders, filterProducts, validManualOrder, orderActionDescription } from '../src/adminModels.js';
const products = [
  {id:'1',name:'Hospira 30mL',sku:'BW-30ML',is_active:true,stock_quantity:3,low_stock_threshold:5,price_cents:2400},
  {id:'2',name:'Extra',sku:'EX',is_active:false,stock_quantity:0,low_stock_threshold:5,price_cents:null}
];
const orders = [
  {order_number:'RW-1', customer_name:'Alice', customer_email:'ALICE@example.ca', status:'pending_review',subtotal_cents:2400,order_items:[{sku:'BW-30ML'}]},
  {order_number:'RW-2', customer_name:'Bob', customer_email:'bob@example.ca', status:'approved',subtotal_cents:4800},
  {order_number:'RW-3', customer_name:'Carol', status:'fulfilled',subtotal_cents:2400},
  {order_number:'RW-4', customer_name:'Dan', status:'cancelled',subtotal_cents:10000}
];
test('overview separates order value from collected revenue and watches only published products',()=>{
  const result=summarizeDashboard(products,orders);
  assert.equal(result.published,1);
  assert.equal(result.unpublished,1);
  assert.equal(result.lowStock.length,1);
  assert.equal(result.availableUnits,3);
  assert.equal(result.pending.length,1);
  assert.equal(result.committedValueCents,7200);
});
test('order search matches customer, email, SKU, number and filters status',()=>{
  assert.equal(filterOrders(orders,'alice').length,1);
  assert.equal(filterOrders(orders,'BW-30ML').length,1);
  assert.equal(filterOrders(orders,'RW-2','approved').length,1);
  assert.equal(filterOrders(orders,'RW-1','approved').length,0);
  assert.equal(filterOrders(orders,'','all').length,4);
});
test('product search handles missing fields and case',()=>{
  assert.equal(filterProducts(products,'hospira').length,1);
  assert.equal(filterProducts(products,'ex').length,1);
});
test('manual order is limited by price, integer quantity, stock and SQL max',()=>{
  assert.equal(validManualOrder(products[0],1),true);
  assert.equal(validManualOrder(products[0],4),false);
  assert.equal(validManualOrder(products[0],1.5),false);
  assert.equal(validManualOrder(products[1],1),false);
  assert.equal(validManualOrder({...products[0],stock_quantity:500},101),false);
});
test('approval, cancellation and fulfillment describe their actual effects',()=>{
  assert.match(orderActionDescription(orders[0],'approved').detail,/deducted/);
  assert.match(orderActionDescription(orders[1],'cancelled').detail,/restored/);
  assert.match(orderActionDescription(orders[0],'cancelled').detail,/No inventory/);
  assert.match(orderActionDescription(orders[1],'fulfilled').detail,/does not process payment/);
});
