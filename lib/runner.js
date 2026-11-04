'use strict';
const {randomUUID}=require('node:crypto');
const {PARTS,isAvailable,isUnavailable,pickupUrl,updatePart}=require('./logic');
const {CORE_SEEDS,EDGE_SEEDS,normalizeLocalStore,makeLocalEmail}=require('./local');
const {snapshotState}=require('./logic');
const KEY='iphone-duo:local:11230:50:v2',LOCK='iphone-duo:local:lock:v2',PAUSED_KEY='iphone-duo:local:paused:v2';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
class RateLimited extends Error{}
async function fetchApple(location){
 const response=await fetch(pickupUrl(location),{headers:{Accept:'application/json','User-Agent':'Mozilla/5.0 (compatible; PersonalPickupMonitor/1.0)'},signal:AbortSignal.timeout(12000),cache:'no-store'});
 if(response.status===403||response.status===429)throw new RateLimited('Apple returned HTTP '+response.status);
 if(!response.ok)throw Error('Apple pickup HTTP '+response.status);
 const json=await response.json();
 const stores=json?.body?.stores;
 if(!Array.isArray(stores))throw Error('Unexpected Apple pickup response');
 return stores;
}
async function runMonitor({redis,sendEmail,fetchStores=fetchApple,now=()=>Date.now(),pause=sleep,coreSeeds=CORE_SEEDS,edgeSeeds=EDGE_SEEDS,edgeBatch=4,minGapMs=1350}){
 const id=randomUUID();
 if(await redis.get(PAUSED_KEY))return {status:'paused',message:'Monitoring paused via GitHub Actions controls'};
 if(await redis.set(LOCK,id,{nx:true,ex:225})!=='OK')return {status:'busy'};
 try {
  const state=snapshotState(await redis.get(KEY));
  if(state.blockedUntil>now())return {status:'cooldown',retryAfter:new Date(state.blockedUntil).toISOString()};
  const cursor=state.priorityCursor||0;
  const selectedEdge=Array.from({length:Math.min(edgeBatch,edgeSeeds.length)},(_,i)=>edgeSeeds[(cursor+i)%edgeSeeds.length]);
  state.priorityCursor=edgeSeeds.length?(cursor+selectedEdge.length)%edgeSeeds.length:0;
  const list=[...new Set([...coreSeeds,...selectedEdge])];
  const seen=new Set(),candidates=[],started=now();
  let checks=0,errors=0,newStores=0,lastError=null,throttled=false,paused=false;
  for(const location of list){
   if(await redis.get(PAUSED_KEY)){paused=true;break;}
   if(checks)await pause(minGapMs);
   checks++;
   try {
    const result=await fetchStores(location);
    for(const original of result){
     const store=normalizeLocalStore(original);
     if(!store||seen.has(store.storeNumber))continue;
     const sid=store.storeNumber;seen.add(sid);
     if(!state.stores[sid])newStores++;
     state.stores[sid]={name:store.storeName,state:store.address.state,city:store.address.city,postalCode:store.address.postalCode,distanceMiles:store.distanceMiles,lastSeen:now()};
     for(const [part,info] of Object.entries(store.partsAvailability||{})){
      if(!(part in PARTS))continue;
      const key=sid+':'+part;
      const {next,candidate}=updatePart(state.inventory[key],info);
      const pickupStatus=isAvailable(info)?'available':isUnavailable(info)?'unavailable':'unknown';
      state.inventory[key]={...next,pickupStatus,observedAt:now(),confirmedAt:pickupStatus==='available'?(next.confirmedAt||null):null};
      if(candidate)candidates.push({store,part,key,location});
     }
    }
   }catch(e){
    errors++;lastError=String(e.message||e).slice(0,160);
    if(e instanceof RateLimited){throttled=true;state.blockedUntil=now()+15*60000;break;}
   }
  }
  // Confirm each newly available store/variant with a second pickup request before email.
  const confirmed=[];
  if(!throttled&&!paused){
   const bySeed=new Map();
   for(const c of candidates){
    if(!bySeed.has(c.location))bySeed.set(c.location,[]);
    bySeed.get(c.location).push(c);
   }
   for(const [location,items] of bySeed){
    if(await redis.get(PAUSED_KEY)){paused=true;break;}
    await pause(minGapMs);
    try{
     const stores=(await fetchStores(location)).map(normalizeLocalStore).filter(Boolean);
     for(const c of items){
      const found=stores.find(s=>s.storeNumber===c.store.storeNumber);
      if(found&&isAvailable(found.partsAvailability[c.part])){
       confirmed.push(c);
       state.inventory[c.key]={...state.inventory[c.key],confirmedAt:now()};
      }
     }
    }catch(e){
     errors++;lastError='Confirmation: '+String(e.message||e).slice(0,140);
     if(e instanceof RateLimited){state.blockedUntil=now()+15*60000;break;}
    }
   }
  }
  const day=new Date(now()).toISOString().slice(0,10);
  if(state.day!==day){state.day=day;state.emailsToday=0;}
  const dailyCap=Math.max(1,Math.min(50,Number(process.env.MAX_EMAILS_PER_DAY)||20));
  let alerts=0;
  if(await redis.get(PAUSED_KEY))paused=true;
  if(!paused&&confirmed.length&&state.emailsToday<dailyCap){
   try{
    await sendEmail(makeLocalEmail(confirmed));
    for(const c of confirmed)state.inventory[c.key]={...state.inventory[c.key],active:true,misses:0,lastSent:now()};
    state.emailsToday++;alerts++;
   }catch(e){errors++;lastError='Email: '+String(e.message||e).slice(0,120);}
  }
  state.lastRun=new Date(now()).toISOString();
  if(checks>errors)state.lastSuccess=state.lastRun;
  state.lastError=lastError;
  state.checkedSeeds+=checks;
  state.lastBatch={checks,errors,prioritySeeds:list.length,nationalSeeds:0,newStores,confirmed:confirmed.length,alerts,ms:now()-started,localOnly:true,paused};
  await redis.set(KEY,state);
  return {status:paused?'paused':throttled?'rate-limited':errors?'partial':'ok',...state.lastBatch,nearbyStores:Object.keys(state.stores).length,lastRun:state.lastRun,lastError};
 }finally{
  try{if(await redis.get(LOCK)===id)await redis.del(LOCK);}catch(e){console.warn('Lock release failed',String(e.message||e));}
 }
}
module.exports={KEY,LOCK,PAUSED_KEY,RateLimited,fetchApple,runMonitor};
