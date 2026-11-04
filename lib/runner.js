'use strict';
const {randomUUID}=require('node:crypto');
const {PARTS,API_URL,FALLBACK_API_URL,isAvailable,isUnavailable,pickupUrl,storesOf,updatePart}=require('./logic');
const {CORE_SEEDS,EDGE_SEEDS,normalizeLocalStore,makeLocalEmail}=require('./local');
const {snapshotState}=require('./logic');
const KEY='iphone-duo:local:11230:50:v2',LOCK='iphone-duo:local:lock:v2',PAUSED_KEY='iphone-duo:local:paused:v2';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
class RateLimited extends Error{}
class ProviderBlocked extends Error{}
// Escalating cooldown after a provider rejection: 5, 10, 20, 40, then 60 minutes. Any successful check resets it.
const BACKOFF_MIN=[5,10,20,40,60];
const backoffMs=strikes=>BACKOFF_MIN[Math.min(strikes,BACKOFF_MIN.length)-1]*60000;
const OUTAGE_MS=45*60000;
async function fetchFrom(base,location){
 const response=await fetch(pickupUrl(location,base),{headers:{Accept:'application/json','User-Agent':'Mozilla/5.0 (compatible; PersonalPickupMonitor/1.1)'},signal:AbortSignal.timeout(12000),cache:'no-store'});
 if(response.status===403||response.status===429)throw new RateLimited('Apple returned HTTP '+response.status);
 if(response.status===541)throw new ProviderBlocked('Apple pickup HTTP 541');
 if(!response.ok)throw Error('Apple pickup HTTP '+response.status);
 const json=await response.json().catch(()=>{throw Error('Apple pickup returned non-JSON');});
 const stores=storesOf(json);
 if(!Array.isArray(stores))throw Error('Unexpected Apple pickup response');
 return stores;
}
// Rejections (403/429/541) are never retried; only a wrong-shaped answer from the primary endpoint tries the fallback.
async function fetchApple(location,fetchUrl=fetchFrom){
 try{return await fetchUrl(API_URL,location);}
 catch(e){if(e instanceof RateLimited||e instanceof ProviderBlocked||/timeout|aborted|fetch failed/i.test(String(e.message)))throw e;return await fetchUrl(FALLBACK_API_URL,location);}
}
async function runMonitor({redis,sendEmail,fetchStores=fetchApple,now=()=>Date.now(),pause=sleep,coreSeeds=CORE_SEEDS,edgeSeeds=EDGE_SEEDS,edgeBatch=4,minGapMs=1350}){
 const id=randomUUID();
 if(await redis.get(PAUSED_KEY))return {status:'paused',message:'Monitoring paused via GitHub Actions controls'};
 // Cheap cooldown check before taking the lock keeps idle calls to two Redis commands.
 const before=snapshotState(await redis.get(KEY));
 if(before.blockedUntil>now())return {status:'cooldown',retryAfter:new Date(before.blockedUntil).toISOString(),lastError:before.lastError||null};
 if(await redis.set(LOCK,id,{nx:true,ex:225})!=='OK')return {status:'busy'};
 try {
  const state=snapshotState(await redis.get(KEY));
  if(state.blockedUntil>now())return {status:'cooldown',retryAfter:new Date(state.blockedUntil).toISOString(),lastError:state.lastError||null};
  const day=new Date(now()).toISOString().slice(0,10);
  if(state.day!==day){state.day=day;state.emailsToday=0;}
  const dailyCap=Math.max(1,Math.min(50,Number(process.env.MAX_EMAILS_PER_DAY)||20));
  const cursor=state.priorityCursor||0;
  const selectedEdge=Array.from({length:Math.min(edgeBatch,edgeSeeds.length)},(_,i)=>edgeSeeds[(cursor+i)%edgeSeeds.length]);
  state.priorityCursor=edgeSeeds.length?(cursor+selectedEdge.length)%edgeSeeds.length:0;
  const list=[...new Set([...coreSeeds,...selectedEdge])];
  const seen=new Set(),candidates=[],started=now();
  let checks=0,successfulChecks=0,errors=0,newStores=0,lastError=null,throttled=false,providerBlocked=false,paused=false;
  for(const location of list){
   if(checks)await pause(minGapMs);
   checks++;
   try {
    const result=await fetchStores(location);
    successfulChecks++;
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
    if(e instanceof RateLimited||e instanceof ProviderBlocked){throttled=true;providerBlocked=e instanceof ProviderBlocked;break;}
   }
  }
  // Confirm each newly available store/variant with a second pickup request before email.
  const confirmed=[];
  // Skip confirmation requests when no alert could be sent today anyway.
  if(!throttled&&state.emailsToday<dailyCap){
   const bySeed=new Map();
   for(const c of candidates){
    if(!bySeed.has(c.location))bySeed.set(c.location,[]);
    bySeed.get(c.location).push(c);
   }
   for(const [location,items] of bySeed){
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
     if(e instanceof RateLimited||e instanceof ProviderBlocked){throttled=true;providerBlocked=e instanceof ProviderBlocked;break;}
    }
   }
  }
  if(throttled){state.blockedStrikes=(state.blockedStrikes||0)+1;state.blockedUntil=now()+backoffMs(state.blockedStrikes);}
  else if(successfulChecks>0)state.blockedStrikes=0;
  let alerts=0;
  if(confirmed.length&&await redis.get(PAUSED_KEY))paused=true;
  if(!paused&&confirmed.length&&state.emailsToday<dailyCap){
   try{
    const delivery=await sendEmail(makeLocalEmail(confirmed));
    state.lastAlert={at:now(),sent:delivery?.sent||['email'],failed:delivery?.failed||[]};
    for(const c of confirmed)state.inventory[c.key]={...state.inventory[c.key],active:true,misses:0,lastSent:now()};
    state.emailsToday++;alerts++;
   }catch(e){errors++;lastError='Email: '+String(e.message||e).slice(0,120);}
  }
  state.lastRun=new Date(now()).toISOString();
  if(successfulChecks>0)state.lastSuccess=state.lastRun;
  state.lastError=lastError;
  // One "monitor is blind" alert per outage, and one when inventory data returns.
  const lastOk=Date.parse(state.lastSuccess)||0;
  const outage=!paused&&lastOk>0&&now()-lastOk>OUTAGE_MS&&!state.outageAlertedAt;
  const recovered=!paused&&state.outageAlertedAt&&successfulChecks>0;
  if(outage||recovered){
   try{
    await sendEmail(outage?{subject:'⚠️ iPhone Duo monitor: no inventory data for '+Math.round((now()-lastOk)/60000)+' min',text:'Apple has not returned inventory data since '+state.lastSuccess+'.\nLast error: '+(lastError||'none')+'\nYou will NOT get restock alerts until this recovers. Check Apple manually if it matters right now.\nNo further warnings will be sent for this outage.'}
     :{subject:'✅ iPhone Duo monitor is back',text:'Inventory checks are working again as of '+state.lastRun+'.'});
    state.outageAlertedAt=outage?now():0;
   }catch(e){lastError='Health alert: '+String(e.message||e).slice(0,120);state.lastError=lastError;}
  }
  state.checkedSeeds+=checks;
  const status=paused?'paused':providerBlocked?'provider-blocked':throttled?'rate-limited':successfulChecks===0&&checks>0?'failed':errors?'partial':'ok';
  state.lastBatch={status,checks,successfulChecks,errors,prioritySeeds:list.length,nationalSeeds:0,newStores,confirmed:confirmed.length,alerts,ms:now()-started,localOnly:true,paused,providerBlocked};
  await redis.set(KEY,state);
  return {...state.lastBatch,nearbyStores:Object.keys(state.stores).length,lastRun:state.lastRun,lastError,retryAfter:state.blockedUntil>now()?new Date(state.blockedUntil).toISOString():null};
 }finally{
  try{if(await redis.get(LOCK)===id)await redis.del(LOCK);}catch(e){console.warn('Lock release failed',String(e.message||e));}
 }
}
module.exports={KEY,LOCK,PAUSED_KEY,BACKOFF_MIN,OUTAGE_MS,RateLimited,ProviderBlocked,fetchApple,runMonitor};
