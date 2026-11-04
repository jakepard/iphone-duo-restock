'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {storesOf,API_URL,FALLBACK_API_URL,isAvailable}=require('../lib/logic');
const {normalizeLocalStore,makeLocalEmail}=require('../lib/local');
const {runMonitor,fetchApple,ProviderBlocked}=require('../lib/runner');
const {withPush}=require('../lib/push');
const {healthOf}=require('../lib/stock');
const PART='MK1E4LL/A';
const avail={pickupDisplay:'available',pickupSearchQuote:'Available Today',messageTypes:{regular:{storeSelectionEnabled:true}}};
const store=(over={})=>({storeNumber:'R100',storeName:'Downtown Brooklyn',city:'Brooklyn',address:{address2:'300 Ashland Place',postalCode:'11217'},storelatitude:40.6866,storelongitude:-73.9779,partsAvailability:{[PART]:avail},...over});
function fakeRedis(){
 const r={stored:null,lock:null,calls:0,paused:null};
 r.get=async key=>{r.calls++;return key.includes(':lock:')?r.lock:key.includes(':paused:')?r.paused:r.stored;};
 r.set=async(key,value,o)=>{r.calls++;if(key.includes(':lock:')){if(r.lock&&o?.nx)return null;r.lock=value;return 'OK';}r.stored=value;return 'OK';};
 r.del=async()=>{r.calls++;r.lock=null;};
 return r;
}
test('parses current fulfillment-messages and legacy pickup-message shapes',()=>{
 assert.equal(storesOf({body:{content:{pickupMessage:{stores:[1,2]}}}}).length,2);
 assert.equal(storesOf({body:{stores:[1]}}).length,1);
 assert.equal(storesOf({body:{}}),undefined);
 assert.equal(isAvailable({pickupDisplay:'available',messageTypes:{compact:{storeSelectionEnabled:true}}}),true);
 assert.equal(isAvailable({pickupDisplay:'available',messageTypes:{regular:{storeSelectionEnabled:false}}}),false);
});
test('distance uses Apple store coordinates when provided',()=>{
 const exact=normalizeLocalStore(store()),zipOnly=normalizeLocalStore(store({storelatitude:undefined,storelongitude:undefined}));
 assert.ok(exact.distanceMiles>4&&exact.distanceMiles<5,String(exact.distanceMiles));
 assert.notEqual(exact.distanceMiles,zipOnly.distanceMiles);
 assert.equal(exact.address.city,'Brooklyn');
});
test('unexpected response falls back to the other endpoint; 541 never retried',async()=>{
 const seen=[];
 const shapeFail=async(base)=>{seen.push(base);if(base===API_URL)throw Error('Unexpected Apple pickup response');return ['ok'];};
 assert.deepEqual(await fetchApple('11230',shapeFail),['ok']);
 assert.deepEqual(seen,[API_URL,FALLBACK_API_URL]);
 seen.length=0;
 await assert.rejects(fetchApple('11230',async b=>{seen.push(b);throw new ProviderBlocked('Apple pickup HTTP 541');}),ProviderBlocked);
 assert.deepEqual(seen,[API_URL]);
});
test('cooldown escalates 5 then 10 minutes and resets after a success',async()=>{
 const redis=fakeRedis();let t=Date.UTC(2026,10,4,12),blocked=true;
 const opts={redis,sendEmail:async()=>({sent:['email']}),fetchStores:async()=>{if(blocked)throw new ProviderBlocked('Apple pickup HTTP 541');return [];},coreSeeds:['11230'],edgeSeeds:[],pause:async()=>{},now:()=>t};
 await runMonitor(opts);assert.equal(redis.stored.blockedUntil,t+5*60000);
 t+=6*60000;await runMonitor(opts);assert.equal(redis.stored.blockedUntil,t+10*60000);
 t+=11*60000;blocked=false;const ok=await runMonitor(opts);
 assert.equal(ok.status,'ok');assert.equal(redis.stored.blockedStrikes,0);
});
test('a run during cooldown makes no Apple request and only two Redis calls',async()=>{
 const redis=fakeRedis();const t=Date.now();let fetches=0;
 redis.stored={v:1,blockedUntil:t+60000,inventory:{},stores:{}};
 const out=await runMonitor({redis,sendEmail:async()=>{},fetchStores:async()=>{fetches++;return [];},coreSeeds:['11230'],edgeSeeds:[],pause:async()=>{},now:()=>t});
 assert.equal(out.status,'cooldown');assert.equal(fetches,0);assert.equal(redis.calls,2);assert.equal(redis.lock,null);
});
test('failed scans keep previous stock observations untouched',async()=>{
 const redis=fakeRedis();const t=Date.now();
 redis.stored={v:1,lastSuccess:new Date(t-60000).toISOString(),inventory:{['R100:'+PART]:{pickupStatus:'unavailable',observedAt:t-60000}},stores:{}};
 await runMonitor({redis,sendEmail:async()=>{},fetchStores:async()=>{throw Error('Apple pickup HTTP 500');},coreSeeds:['11230'],edgeSeeds:[],pause:async()=>{},now:()=>t});
 assert.deepEqual(redis.stored.inventory['R100:'+PART],{pickupStatus:'unavailable',observedAt:t-60000});
});
test('one outage warning per outage, then one recovery notice',async()=>{
 const redis=fakeRedis(),sent=[];let t=Date.UTC(2026,10,4,12),fail=true;
 redis.stored={v:1,lastSuccess:new Date(t-50*60000).toISOString(),inventory:{},stores:{}};
 const opts={redis,sendEmail:async m=>{sent.push(m.subject);return {sent:['email']};},fetchStores:async()=>{if(fail)throw Error('Apple pickup HTTP 500');return [];},coreSeeds:['11230'],edgeSeeds:[],pause:async()=>{},now:()=>t};
 await runMonitor(opts);t+=60000;await runMonitor(opts);
 assert.equal(sent.length,1);assert.match(sent[0],/no inventory data/);
 fail=false;t+=60000;await runMonitor(opts);t+=60000;await runMonitor(opts);
 assert.equal(sent.length,2);assert.match(sent[1],/back/);
});
test('alert email has store, address, distance, variant, Apple quote and buy link',()=>{
 const m=makeLocalEmail([{store:normalizeLocalStore(store()),part:PART}]);
 assert.match(m.subject,/Downtown Brooklyn — 256GB Star White/);
 for(const re of [/Store: Downtown Brooklyn/,/Location: 300 Ashland Place, Brooklyn, NY 11217/,/Distance: about 4\.\d miles/,/Available: 256GB Star White/,/Apple says: Available Today/,/BUY NOW: https:\/\/www\.apple\.com\/shop\/buy-iphone\/iphone-duo/,/google\.com\/maps/])assert.match(m.text,re);
});
test('push: succeeds if any channel works, fails only if all fail, never leaks token',async()=>{
 const real=global.fetch;const posts=[];
 global.fetch=async(url,o)=>{posts.push({url,body:JSON.parse(o.body)});return {ok:!String(url).includes('telegram'),status:500};};
 try{
  const env={NTFY_TOPIC:'my-secret-topic',TELEGRAM_BOT_TOKEN:'123:abc',TELEGRAM_CHAT_ID:'9'};
  const r=await withPush(async()=>{throw Error('smtp down');},env)({subject:'Hi there',text:'Body text',url:'https://x.test'});
  assert.deepEqual(r.sent,['ntfy']);assert.equal(r.failed.length,2);
  assert.ok(!r.failed.join(' ').includes('abc'));
  assert.equal(posts[0].body.topic,'my-secret-topic');assert.equal(posts[0].body.click,'https://x.test');
  await assert.rejects(withPush(async()=>{throw Error('smtp down');},{})({subject:'a',text:'b'}),/All alert channels failed/);
 }finally{global.fetch=real;}
});
test('health states: paused, cooldown, never, stale, ok',()=>{
 const t=Date.now(),iso=ms=>new Date(ms).toISOString();
 assert.equal(healthOf({},t,true).state,'paused');
 assert.equal(healthOf({blockedUntil:t+1000},t,false).state,'cooldown');
 assert.equal(healthOf({},t,false).state,'never');
 assert.equal(healthOf({lastSuccess:iso(t-20*60000)},t,false).state,'stale');
 assert.equal(healthOf({lastSuccess:iso(t-60000),lastBatch:{errors:1}},t,false).state,'errors');
 assert.equal(healthOf({lastSuccess:iso(t-60000),lastBatch:{errors:0}},t,false).state,'ok');
});
