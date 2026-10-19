import test from 'node:test';
import assert from 'node:assert/strict';
import {vialCount,formatAvailability,isRequestable,MAX_REQUEST_VIALS} from '../src/packaging.js';
const pack=(id,code,units,kind,max=20)=>({id,code,vials_per_pack:units,stock_kind:kind,max_per_request:max,price_cents:2500,active:true});
const single=pack('a','single',1,'loose'),ten=pack('b','ten',10,'loose'),sealed=pack('c','case',25,'sealed');
test('one product has 1, 10, 25 physical vial equivalents',()=>{
 assert.equal(vialCount([{quantity:3,vials_per_pack:1},{quantity:2,vials_per_pack:10},{quantity:1,vials_per_pack:25}]),48);
});
test('10-pack and singles share eligible loose inventory',()=>{
 const stock={loose:21,sealed:2};
 assert.deepEqual(formatAvailability(ten,[],stock),{limit:2,remaining:2,inCart:0});
 assert.deepEqual(formatAvailability(ten,[{package_id:'a',stock_kind:'loose',vials_per_pack:1,quantity:12}],stock),{limit:0,remaining:0,inCart:0});
 assert.deepEqual(formatAvailability(single,[{package_id:'b',stock_kind:'loose',vials_per_pack:10,quantity:2}],stock),{limit:1,remaining:1,inCart:0});
});
test('a factory-sealed case cannot be created from 25 loose vials',()=>{
 assert.equal(formatAvailability(sealed,[],{loose:100,sealed:0}).remaining,0);
 assert.equal(formatAvailability(sealed,[],{loose:0,sealed:3}).remaining,3);
});
test('selected packages are deducted from remaining request limits',()=>{
 assert.deepEqual(formatAvailability(ten,[{package_id:'b',stock_kind:'loose',vials_per_pack:10,quantity:1}],{loose:20,sealed:0}),{limit:2,remaining:1,inCart:1});
});
test('hard cap on physical vial equivalents',()=>{
 const large=pack('d','case',25,'sealed',100);
 assert.equal(formatAvailability(large,[],{loose:0,sealed:200}).limit,MAX_REQUEST_VIALS/25);
 assert.equal(isRequestable(single,{remaining:0}),false);
 assert.equal(isRequestable(single,{remaining:1}),true);
 assert.equal(isRequestable({...single,price_cents:null},{remaining:1}),false);
});
