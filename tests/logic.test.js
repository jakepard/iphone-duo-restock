'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PARTS,selectedSeeds,stepCursor,stateCode,isAvailable,updatePart,pickupUrl}=require('../lib/logic');
test('eight variants',()=>assert.equal(Object.keys(PARTS).length,8));
test('pickup URL includes all parts',()=>assert.equal([...new URL(pickupUrl('10001')).searchParams.keys()].filter(k=>k.startsWith('parts.')).length,8));
test('NY/NJ priority',()=>{assert.equal(stateCode({address:{state:'New York'}}),'NY');assert.equal(stateCode({address:{state:'NJ'}}),'NJ');});
test('positive availability only',()=>{assert.equal(isAvailable({pickupDisplay:'available',messageTypes:{regular:{storeSelectionEnabled:true}}}),true);assert.equal(isAvailable({pickupDisplay:'unavailable'}),false);});
test('two explicit unavailable checks clear suppression',()=>{
const yes={pickupDisplay:'available',messageTypes:{regular:{storeSelectionEnabled:true}}},no={pickupDisplay:'unavailable'};
let s=updatePart(null,yes).next;s={...s,active:true};
s=updatePart(s,no).next;assert.equal(s.active,true);
s=updatePart(s,no).next;assert.equal(s.active,false);
assert.equal(updatePart(s,yes).candidate,true);
});
test('seed rotation',()=>{assert.deepEqual(selectedSeeds(['a','b','c'],2,2),['c','a']);assert.equal(stepCursor(2,2,3),1);});
