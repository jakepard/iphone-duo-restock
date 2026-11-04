'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeLocalStore,makeLocalEmail,CORE_SEEDS,EDGE_SEEDS}=require('../lib/local');
const {runMonitor}=require('../lib/runner');
const {toPublicFeed}=require('../lib/stock');
const PART='MK1E4LL/A';
const avail={pickupDisplay:'available',messageTypes:{regular:{storeSelectionEnabled:true}}};
const unavailable={pickupDisplay:'unavailable'};
const record=(zip,partStatus=avail)=>({storeNumber:'R100',storeName:'Example Brooklyn',address:{postalCode:zip},partsAvailability:{[PART]:partStatus}});
test('11230 included and remote ZIP excluded',()=>{
 const center=normalizeLocalStore(record('11230'));
 assert.ok(center);assert.equal(center.distanceMiles,0);
 assert.equal(normalizeLocalStore(record('94110')),null);
 assert.equal(normalizeLocalStore(record('07030'))?.address.state,'NJ');
 assert.equal(normalizeLocalStore(record('10001'))?.address.state,'NY');
});
test('every seed is a ZIP and core contains origin',()=>{assert.ok(CORE_SEEDS.includes('11230'));for(const zip of [...CORE_SEEDS,...EDGE_SEEDS])assert.match(zip,/^\d{5}$/);});
test('only local store appears on dashboard, freshness is strict',()=>{
 const now=Date.now();
 const raw={v:1,stores:{R100:{name:'Nearby',state:'NY',postalCode:'11230',distanceMiles:0},R101:{name:'Far',state:'CA',postalCode:'94110',distanceMiles:2500}},inventory:{['R100:'+PART]:{pickupStatus:'available',observedAt:now}}};
 const feed=toPublicFeed(raw,now);
 assert.equal(feed.stores.length,1);assert.equal(feed.summary.availableStores,1);
 assert.equal(toPublicFeed(raw,now+20*60*1000).summary.availableStores,0);
});
test('mail has store, SKU, city, distance and buy link',()=>{
 const email=makeLocalEmail([{store:normalizeLocalStore(record('11230')),part:PART}]);
 assert.match(email.text,/Example Brooklyn/);assert.match(email.text,/11230/);
 assert.match(email.text,/256GB Star White/);assert.match(email.text,/https:\/\/www.apple.com\/shop\/buy-iphone/);
});
test('initial availability confirms and sends once, outside radius ignored',async()=>{
 let stored=null,lock=null,emails=[],calls=[];
 const redis={async get(key){return key.includes(':lock:')?lock:key.includes(':paused:')?null:stored;},async set(key,value,options){if(key.includes(':lock:')){if(lock&&options?.nx)return null;lock=value;return 'OK';}stored=value;return 'OK';},async del(){lock=null;}};
 const fetchStores=async(zip)=>{calls.push(zip);return [record('11230'),{...record('94110'),storeNumber:'R999'}];};
 const deps={redis,sendEmail:async m=>emails.push(m),fetchStores,coreSeeds:['11230'],edgeSeeds:[],pause:async()=>{},now:()=>Date.now()};
 const first=await runMonitor(deps),second=await runMonitor(deps);
 assert.equal(first.confirmed,1);assert.equal(first.alerts,1);assert.equal(second.alerts,0);
 assert.equal(emails.length,1);assert.equal(first.nearbyStores,1);assert.deepEqual(calls,['11230','11230','11230']);
});
