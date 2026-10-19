import test from 'node:test';
import assert from 'node:assert/strict';
import { maxOrderable, nextCartQuantity, MAX_REQUEST_UNITS } from '../src/productQuantity.js';
test('caps total requested quantity at the database maximum',()=>{
  assert.equal(MAX_REQUEST_UNITS,25);
  assert.equal(maxOrderable(500,20),5);
  assert.equal(nextCartQuantity(500,20,20),25);
});
test('never exceeds available stock when adding quantity',()=>{
  assert.equal(maxOrderable(8,3),5);
  assert.equal(nextCartQuantity(8,3,7),8);
  assert.equal(maxOrderable(0,0),0);
  assert.equal(nextCartQuantity(0,0,5),0);
});
test('handles non-positive and malformed quantities conservatively',()=>{
  assert.equal(maxOrderable(-5,0),0);
  assert.equal(maxOrderable('invalid',0),0);
  assert.equal(nextCartQuantity(10,2,-10),3);
});
