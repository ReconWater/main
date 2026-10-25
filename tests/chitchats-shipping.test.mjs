import test from 'node:test';
import assert from 'node:assert/strict';
import { validateShippingProfile } from '../netlify/functions/_chitchats.mjs';

test('Chit Chats profile requires active measured parcel dimensions',()=>{
  assert.equal(validateShippingProfile(null),'Shipping profile is not active');
  assert.equal(validateShippingProfile({active:true,weight_g:100,length_cm:10,width_cm:5,height_cm:null}),'Packed weight and dimensions are required');
  assert.equal(validateShippingProfile({active:true,weight_g:100,length_cm:10,width_cm:5,height_cm:3}),null);
});
