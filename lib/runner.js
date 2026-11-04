'use strict';
const {randomUUID}=require('node:crypto');
const locations=require('./seeds.json');
const {PARTS,isUsStore,stateCode,isAvailable,pickupUrl,selectedSeeds,stepCursor,snapshotState,updatePart,formatEmail}=require('./logic');
const KEY='iphone-duo:state:v1',LOCK='iphone-duo:lock:v1';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class RateLimited extends Error {}
async function fetchApple(location){
const response=await fetch(pickupUrl(location),{headers:{Accept:'application/json','User-Agent':'Mozilla/5.0 (compatible; PersonalPickupMonitor/1.0)'},signal:AbortSignal.timeout(12000),cache:'no-store'});
if([429,403].includes(response.status))throw new RateLimited('Apple responded HTTP '+response.status);
if(!response.ok)throw Error('Apple pickup HTTP '+response.status);
const json=await response.json();
const stores=json?.body?.stores;
if(!Array.isArray(stores)||!stores.length)throw Error('Unexpected/empty pickup response');
const us=stores.filter(isUsStore);
if(!us.length)throw Error('No US stores returned');
return us;
}
async function runMonitor({redis,sendEmail,fetchStores=fetchApple,now=()=>Date.now(),pause=sleep,seeds=locations,priorityBatch=10,nationalBatch=12,minGapMs=1800}){
const id=randomUUID();
if(await redis.set(LOCK,id,{nx:true,ex:240})!=='OK')return {status:'busy'};
try{
const state=snapshotState(await redis.get(KEY));
if(state.blockedUntil>now())return {status:'cooldown',retryAfter:new Date(state.blockedUntil).toISOString()};
const priority=selectedSeeds(seeds.priority,state.priorityCursor,priorityBatch);
const national=selectedSeeds(seeds.national,state.nationalCursor,nationalBatch);
state.priorityCursor=stepCursor(state.priorityCursor,priorityBatch,seeds.priority.length);
state.nationalCursor=stepCursor(state.nationalCursor,nationalBatch,seeds.national.length);
const checkList=[...priority.map(location=>({location,tier:'priority'})),...national.map(location=>({location,tier:'national'}))];
let checks=0,errors=0,newStores=0,lastError=null,throttled=false;
const started=now(),seen=new Set(),candidates=[];
for(const {location,tier} of checkList){
if(checks)await pause(minGapMs);
try{
const stores=await fetchStores(location);checks++;
for(const store of stores){
const sid=String(store.storeNumber);
if(seen.has(sid))continue;
seen.add(sid);
if(!state.stores[sid])newStores++;
state.stores[sid]={name:store.storeName||sid,state:stateCode(store),postalCode:store?.address?.postalCode||'',lastSeen:now()};
for(const [part,info] of Object.entries(store.partsAvailability||{})){
if(!(part in PARTS))continue;
const key=sid+':'+part;
const {next,candidate}=updatePart(state.inventory[key],info);
state.inventory[key]=next;
if(candidate)candidates.push({store,part,location,tier,key});
}
}
}catch(error){
checks++;errors++;lastError=String(error?.message||error).slice(0,160);
if(error instanceof RateLimited){throttled=true;state.blockedUntil=now()+900000;break;}
}
}
const confirmed=[];
if(!throttled){
const grouped=new Map();
for(const c of candidates){if(!grouped.has(c.location))grouped.set(c.location,[]);grouped.get(c.location).push(c);}
for(const [location,items] of grouped){
if(confirmed.length>=40)break;
await pause(minGapMs);
try{
const stores=await fetchStores(location);
for(const item of items){const same=stores.find(s=>String(s.storeNumber)===String(item.store.storeNumber));if(same&&isAvailable(same.partsAvailability?.[item.part]))confirmed.push(item);}
}catch(error){
errors++;lastError='Confirmation: '+String(error?.message||error).slice(0,120);
if(error instanceof RateLimited){state.blockedUntil=now()+900000;break;}
}
}
}
const day=new Date(now()).toISOString().slice(0,10);
if(state.day!==day){state.day=day;state.emailsToday=0;}
const sent=[];
const dailyCap=Math.max(1,Math.min(70,Number(process.env.MAX_EMAILS_PER_DAY)||20));
for(const priorityFlag of [true,false]){
const items=confirmed.filter(c=>['NY','NJ'].includes(stateCode(c.store))===priorityFlag).slice(0,40);
if(!items.length||state.emailsToday>=dailyCap)continue;
try{
await sendEmail(formatEmail(items,priorityFlag));
for(const item of items)state.inventory[item.key]={active:true,misses:0,lastSent:now()};
state.emailsToday++;
sent.push({region:priorityFlag?'priority':'national',stores:new Set(items.map(x=>x.store.storeNumber)).size,variants:items.length});
}catch(error){errors++;lastError='Email: '+String(error?.message||error).slice(0,120);}
}
state.lastRun=new Date(now()).toISOString();
if(checks>errors)state.lastSuccess=state.lastRun;
state.lastError=lastError;
state.checkedSeeds+=checks;
state.lastBatch={prioritySeeds:priority.length,nationalSeeds:national.length,checks,errors,newStores,confirmed:confirmed.length,alerts:sent,ms:now()-started};
await redis.set(KEY,state);
return {status:throttled?'rate-limited':errors?'partial':'ok',...state.lastBatch,discoveredUSStores:Object.keys(state.stores).length,lastRun:state.lastRun,lastError};
}finally{if(await redis.get(LOCK)===id)await redis.del(LOCK);}
}
module.exports={KEY,LOCK,RateLimited,fetchApple,runMonitor};
