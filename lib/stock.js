'use strict';
const {PARTS,BUY_URL,snapshotState}=require('./logic');
const {CENTER_ZIP,RADIUS_MILES}=require('./local');
const FRESH_MS=15*60*1000;
function toPublicFeed(raw,now=Date.now()){
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
 return {status:state.lastRun?'running-or-idle':'awaiting-first-check',lastRun:state.lastRun,lastSuccess:state.lastSuccess,lastBatch:{checks:state.lastBatch?.checks||0,errors:state.lastBatch?.errors||0},freshnessMinutes:FRESH_MS/60000,centerZip:CENTER_ZIP,radiusMiles:RADIUS_MILES,buyUrl:BUY_URL,summary:{observedStores:stores.length,freshStores:stores.filter(s=>s.checkedVariants).length,availableStores:stores.filter(s=>s.available).length,availableVariants:stores.reduce((n,s)=>n+s.available,0),priorityStores:stores.length},stores};
}
module.exports={FRESH_MS,toPublicFeed};
