'use strict';
const {PARTS,BUY_URL,snapshotState}=require('./logic');
const {CENTER_ZIP,RADIUS_MILES}=require('./local');
const FRESH_MS=15*60*1000;
const providerIssue=e=>!e?null:
 e.includes('HTTP 403')?'Apple rejected requests (403)':
 e.includes('HTTP 429')?'Apple rate limited requests (429)':
 e.includes('HTTP 541')?'Apple rejected the pickup request (HTTP 541)':
 e.includes('Apple pickup HTTP')?e.slice(0,90):
 /Unexpected|non-JSON/i.test(e)?'Apple returned an unexpected response':
 /timeout|aborted/i.test(e)?'Apple timed out':
 /fetch failed/i.test(e)?'Could not reach Apple':
 /^(Email|Health alert)/.test(e)?'Alert delivery failed':
 'Inventory check error';
// One overall state so the dashboard never shows an outage as "out of stock".
function healthOf(state,now,paused){
 const ok=Date.parse(state.lastSuccess)||0,cooldown=Number(state.blockedUntil)>now,mins=ok?Math.round((now-ok)/60000):null;
 if(paused)return {state:'paused',label:'Monitoring paused',detail:'No checks or alerts until resumed.'};
 if(cooldown)return {state:'cooldown',label:'Waiting — Apple rejected requests',detail:'Backing off to respect Apple. Last good data '+(mins===null?'never':mins+' min ago')+'.'};
 if(!ok)return {state:'never',label:'No successful check yet',detail:'Availability is unknown.'};
 if(now-ok>FRESH_MS)return {state:'stale',label:'Data is old',detail:'Last good data '+mins+' min ago. Treat everything as unknown.'};
 if(state.lastBatch?.errors)return {state:'errors',label:'Working, with some errors',detail:'Last good data '+mins+' min ago.'};
 return {state:'ok',label:'Monitoring normally',detail:'Last good data '+(mins<1?'under a minute':mins+' min')+' ago.'};
}
function toPublicFeed(raw,now=Date.now(),{paused=false}={}){
 const state=snapshotState(raw);
 const stores=Object.entries(state.stores||{}).filter(([,s])=>typeof s.distanceMiles==='number'&&s.distanceMiles<=RADIUS_MILES).map(([id,store])=>{
  let available=0,checkedVariants=0,lastChecked=0;
  const variants=Object.entries(PARTS).map(([part,label])=>{
   const record=state.inventory?.[id+':'+part]||{},observedAt=Number(record.observedAt)||0;
   const fresh=observedAt>0&&now-observedAt>=-60000&&now-observedAt<=FRESH_MS;
   const lastStatus=['available','unavailable','unknown'].includes(record.pickupStatus)?record.pickupStatus:'unknown';
   const status=!observedAt?'not-checked':!fresh?'stale':lastStatus;
   if(fresh){checkedVariants++;if(status==='available')available++;}
   lastChecked=Math.max(lastChecked,observedAt);
   return {part,label,storage:label.split(' ')[0],color:label.includes('Night Sky')?'Night Sky':'Star White',status,lastStatus,observedAt:observedAt||null,confirmedAt:record.confirmedAt||null};
  });
  return {id,name:String(store.name||id),city:store.city||'',state:store.state||'',postalCode:store.postalCode||'',distanceMiles:store.distanceMiles,lastChecked:lastChecked||null,available,checkedVariants,variants};
 });
 stores.sort((a,b)=>b.available-a.available||a.distanceMiles-b.distanceMiles||a.name.localeCompare(b.name));
 return {status:paused?'paused':state.lastRun?'running-or-idle':'awaiting-first-check',health:healthOf(state,now,paused),monitorPaused:paused,lastSuccessfulScan:state.lastSuccess||null,cooldownUntil:Number(state.blockedUntil)>now?new Date(state.blockedUntil).toISOString():null,lastProviderIssue:providerIssue(String(state.lastError||'')),lastAlert:state.lastAlert||null,lastRun:state.lastRun,lastSuccess:state.lastSuccess,lastBatch:{status:state.lastBatch?.status||null,checks:state.lastBatch?.checks||0,successfulChecks:state.lastBatch?.successfulChecks||0,errors:state.lastBatch?.errors||0},freshnessMinutes:FRESH_MS/60000,centerZip:CENTER_ZIP,radiusMiles:RADIUS_MILES,buyUrl:BUY_URL,summary:{observedStores:stores.length,freshStores:stores.filter(s=>s.checkedVariants).length,availableStores:stores.filter(s=>s.available).length,availableVariants:stores.reduce((n,s)=>n+s.available,0),priorityStores:stores.length},stores};
}
module.exports={FRESH_MS,healthOf,toPublicFeed};
