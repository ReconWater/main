import test from 'node:test';
import assert from 'node:assert/strict';
import {packageAvailability,availableStock} from '../src/availability.js';
const packs=[{id:'single',stock_kind:'loose',vials_per_pack:1},{id:'ten',stock_kind:'loose',vials_per_pack:10},{id:'case',stock_kind:'sealed',vials_per_pack:25}];
const lot=(loose,sealed=0,extra={})=>({status:'available',expiry_date:'2028-12-31',loose_on_hand:loose,loose_reserved:0,sealed_on_hand:sealed,sealed_reserved:0,...extra});
test('two partially stocked lots cannot be combined into one same-lot bundle',()=>{
 const result=packageAvailability(packs,[lot(6),lot(6)],'2026-10-19');
 assert.deepEqual(result,{loose:12,sealed:0,byId:{single:12,ten:0,case:0}});
});
test('ten-vial format consumes free units from each eligible lot only',()=>{
 const result=packageAvailability(packs,[lot(29,1,{loose_reserved:10}),lot(10,2,{loose_reserved:1}),lot(99,2,{status:'quarantine'})],'2026-10-19');
 assert.deepEqual(result,{loose:28,sealed:3,byId:{single:28,ten:1,case:3}});
});
test('expired and recalled lots are excluded from saleable availability',()=>{
 assert.deepEqual(availableStock([lot(10,1,{expiry_date:'2020-01-01'}),lot(30,2,{status:'recalled'}),lot(7,1)],'2026-10-19').loose,7);
});
test('sealed cases never contribute to loose-vial availability',()=>{
 assert.equal(packageAvailability(packs,[lot(0,4)],'2026-10-19').byId.ten,0);
 assert.equal(packageAvailability(packs,[lot(0,4)],'2026-10-19').byId.case,4);
});
