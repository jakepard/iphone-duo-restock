'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {toPublicFeed}=require('../lib/stock');
test('feed shows nearby NY/NJ stores and all eight configurations, excluding distant stores',()=>{
const now=Date.now();
const raw={v:1,lastRun:new Date(now).toISOString(),stores:{
 B:{name:'Example NJ',state:'NJ',distanceMiles:12,lastSeen:now},
 A:{name:'Example NY',state:'NY',city:'New York',distanceMiles:5,lastSeen:now},
 C:{name:'Remote CA',state:'CA',distanceMiles:2500,lastSeen:now}
},inventory:{'A:MK1E4LL/A':{pickupStatus:'available',observedAt:now,confirmedAt:now},'B:MK1F4LL/A':{pickupStatus:'unavailable',observedAt:now}}};
const feed=toPublicFeed(raw,now);
assert.equal(feed.stores.length,2);
assert.equal(feed.stores[0].id,'A');
assert.equal(feed.stores[0].variants.length,8);
assert.equal(feed.stores[0].variants[0].status,'available');
assert.equal(feed.summary.availableStores,1);
assert.equal(feed.summary.availableVariants,1);
assert.equal(feed.stores[1].variants[1].status,'unavailable');
});
test('old availability is stale rather than in stock',()=>{
const now=Date.now();
const data=toPublicFeed({v:1,stores:{A:{name:'Store',state:'NJ',distanceMiles:10}},inventory:{'A:MK1E4LL/A':{pickupStatus:'available',observedAt:now-45*60000}}},now);
assert.equal(data.summary.availableVariants,0);
assert.equal(data.stores[0].variants[0].status,'stale');
assert.equal(data.stores[0].variants[0].lastStatus,'available');
});
test('stores with no observations are not shown as unavailable',()=>{
const feed=toPublicFeed({v:1,stores:{R1:{name:'First',state:'NJ',distanceMiles:8}}},Date.now());
assert.equal(feed.stores[0].variants[0].status,'not-checked');
assert.equal(feed.summary.freshStores,0);
});
