'use strict';
const PARTS=Object.freeze({
'MK1E4LL/A':'256GB Star White','MK1F4LL/A':'256GB Night Sky',
'MK1G4LL/A':'512GB Star White','MK1H4LL/A':'512GB Night Sky',
'MK1J4LL/A':'1TB Star White','MK1L4LL/A':'1TB Night Sky',
'MK1Q4LL/A':'2TB Star White','MK1R4LL/A':'2TB Night Sky'
});
const BUY_URL='https://www.apple.com/shop/buy-iphone/iphone-duo';
const API_URL='https://www.apple.com/shop/retail/pickup-message';
const stateCode=s=>{
const value=String(s?.address?.state??s?.address?.stateCode??s?.address?.province??'').toUpperCase().trim();
return ({'NEW YORK':'NY','NEW JERSEY':'NJ','US-NY':'NY','US-NJ':'NJ'})[value]||value;
};
function isUsStore(s){const code=String(s?.address?.countryCode??s?.address?.country??'').toUpperCase();return !!s?.storeNumber&&['','US','USA','UNITED STATES'].includes(code);}
const isAvailable=info=>info?.pickupDisplay==='available'&&info?.messageTypes?.regular?.storeSelectionEnabled===true;
const isUnavailable=info=>info?.pickupDisplay==='unavailable';
function pickupUrl(location){
const url=new URL(API_URL);
url.searchParams.set('pl','true');url.searchParams.set('mts.0','regular');url.searchParams.set('location',location);
Object.keys(PARTS).forEach((p,i)=>url.searchParams.set('parts.'+i,p));
return url.toString();
}
function selectedSeeds(seeds,index,size){if(!seeds.length)return [];return Array.from({length:Math.min(size,seeds.length)},(_,i)=>seeds[(index+i)%seeds.length]);}
const stepCursor=(cursor,size,n)=>n?(cursor+Math.min(size,n))%n:0;
function newState(){return {v:1,priorityCursor:0,nationalCursor:0,inventory:{},stores:{},lastRun:null,lastSuccess:null,lastError:null,day:'',emailsToday:0,checkedSeeds:0,lastBatch:null,blockedUntil:0};}
function snapshotState(s){return s&&typeof s==='object'&&s.v===1?{...newState(),...s,inventory:s.inventory||{},stores:s.stores||{}}:newState();}
function updatePart(prev,info){
const p=prev||{active:false,misses:0,lastSent:0};
if(isAvailable(info))return {next:{...p,misses:0},candidate:!p.active};
if(isUnavailable(info)&&p.active){const misses=(p.misses||0)+1;return {next:{...p,misses,active:misses<2},candidate:false};}
return {next:p,candidate:false};
}
const fmtStore=s=>`${s.storeName||s.storeNumber} (${stateCode(s)||'US'} ${s?.address?.postalCode||''})`;
function formatEmail(items,priority){
const stores=new Map();
for(const item of items){const id=item.store.storeNumber;if(!stores.has(id))stores.set(id,{store:item.store,variants:new Set()});stores.get(id).variants.add(PARTS[item.part]);}
const lines=[`iPhone Duo pickup detected — ${priority?'NY/NJ PRIORITY':'OTHER US'}`,'','Availability can disappear quickly. Buy or select pickup at Apple:',BUY_URL,''];
for(const {store,variants} of stores.values())lines.push('• '+fmtStore(store),'  '+[...variants].join(', '),'');
lines.push('Not reserved. Verify stock before traveling. Independent project, not affiliated with Apple.');
return {subject:`[iPhone Duo ${priority?'NY/NJ':'US'}] ${stores.size} store(s) — ${fmtStore(items[0].store)}`,text:lines.join('\n')};
}
module.exports={PARTS,BUY_URL,API_URL,isUsStore,stateCode,isAvailable,isUnavailable,pickupUrl,selectedSeeds,stepCursor,newState,snapshotState,updatePart,fmtStore,formatEmail};
