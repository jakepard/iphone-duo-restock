'use strict';
const {PARTS,BUY_URL,snapshotState}=require('./logic');
const FRESH_MS=30*60*1000;
function toPublicFeed(raw,now=Date.now()){
const state=snapshotState(raw);
let availableStores=0,availableVariants=0,freshStores=0;
const stores=Object.entries(state.stores||{}).map(([id,store])=>{
let available=0,fresh=0,lastChecked=0;
const variants=Object.entries(PARTS).map(([part,label])=>{
const record=state.inventory?.[id+':'+part]||{};
const observedAt=Number(record.observedAt)||0;
const age=now-observedAt;
const isFresh=observedAt>0&&age>=-60000&&age<=FRESH_MS;
const reported=['available','unavailable','unknown'].includes(record.pickupStatus)?record.pickupStatus:'unknown';
const status=!observedAt?'not-checked':!isFresh?'stale':reported;
if(isFresh){fresh++;if(status==='available'){available++;availableVariants++;}}
lastChecked=Math.max(lastChecked,observedAt);
return {part,label,storage:label.split(' ')[0],color:label.includes('Night Sky')?'Night Sky':'Star White',status,lastStatus:reported,observedAt:observedAt||null,confirmedAt:record.confirmedAt||null};
});
if(available)availableStores++;
if(fresh)freshStores++;
return {id,name:String(store.name||id),city:String(store.city||''),state:String(store.state||''),postalCode:String(store.postalCode||''),lastChecked:lastChecked||null,available,checkedVariants:fresh,variants};
});
stores.sort((a,b)=>Number(['NY','NJ'].includes(b.state))-Number(['NY','NJ'].includes(a.state))||b.available-a.available||a.state.localeCompare(b.state)||a.name.localeCompare(b.name));
return {status:state.lastRun?'running-or-idle':'awaiting-first-check',lastRun:state.lastRun,lastSuccess:state.lastSuccess,lastBatch:{checks:state.lastBatch?.checks||0,errors:state.lastBatch?.errors||0},freshnessMinutes:FRESH_MS/60000,buyUrl:BUY_URL,summary:{observedStores:stores.length,freshStores,availableStores,availableVariants,priorityStores:stores.filter(s=>['NY','NJ'].includes(s.state)).length},stores};
}
module.exports={FRESH_MS,toPublicFeed};
