'use strict';
const zipcodes=require('zipcodes');
const CENTER_ZIP='11230';
const RADIUS_MILES=50;
const center=zipcodes.lookup(CENTER_ZIP);
if(!center)throw new Error('ZIP reference not available for 11230');
const CORE_SEEDS=Object.freeze(['11230','10001','10314','07073','11530']);
const EDGE_SEEDS=Object.freeze(['07601','07090','08807','07728','07866','10601','11743','10954','07054','07083']);
function zipOf(address){
 const raw=String(address?.postalCode??address?.zipCode??address?.zip??'');
 const match=raw.match(/\b(\d{5})(?:-\d{4})?\b/);
 return match?match[1]:null;
}
function distanceMiles(lat1,lon1,lat2,lon2){
 const rad=Math.PI/180;
 const dLat=(lat2-lat1)*rad,dLon=(lon2-lon1)*rad;
 const a=Math.sin(dLat/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)**2;
 return 3958.7613*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function normalizeLocalStore(store){
 if(!store||!store.storeNumber)return null;
 const postal=zipOf(store.address);
 if(!postal)return null;
 const geo=zipcodes.lookup(postal);
 if(!geo||!['NY','NJ','CT'].includes(geo.state))return null;
 // Prefer Apple's store coordinates; fall back to the store ZIP centroid.
 const lat=Number(store.storelatitude),lon=Number(store.storelongitude);
 const exact=Number.isFinite(lat)&&Number.isFinite(lon)&&lat!==0&&lon!==0;
 const distance=distanceMiles(center.latitude,center.longitude,exact?lat:geo.latitude,exact?lon:geo.longitude);
 if(distance>RADIUS_MILES)return null;
 return {
  storeNumber:String(store.storeNumber),
  storeName:String(store.storeName||store.storeNumber),
  address:{...store.address,postalCode:postal,city:store.address?.city||store.city||geo.city,state:geo.state},
  distanceMiles:Math.round(distance*10)/10,
  partsAvailability:store.partsAvailability||{}
 };
}
const streetOf=a=>{const v=a?.address2||a?.addressLines||a?.addressLine1||a?.street||a?.address1||'';return Array.isArray(v)?v.join(', '):String(v);};
const quoteOf=info=>String(info?.pickupSearchQuote||info?.messageTypes?.regular?.storePickupQuote||'').replace(/<[^>]*>/g,'').trim();
function makeLocalEmail(items){
 const {BUY_URL,PARTS}=require('./logic');
 const stores=new Map();
 for(const item of items){
  const s=item.store;
  if(!stores.has(s.storeNumber))stores.set(s.storeNumber,{store:s,variants:[],quote:''});
  const entry=stores.get(s.storeNumber);
  entry.variants.push(PARTS[item.part]);
  entry.quote=entry.quote||quoteOf(s.partsAvailability?.[item.part]);
 }
 const groups=[...stores.values()].sort((a,b)=>a.store.distanceMiles-b.store.distanceMiles);
 const lines=['IPHONE DUO RESTOCK AVAILABLE',''];
 for(const {store,variants,quote} of groups){
  const a=store.address||{};
  lines.push('Store: '+store.storeName);
  lines.push('Location: '+[streetOf(a),a.city,[a.state,a.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', '));
  lines.push('Distance: about '+store.distanceMiles+' miles from 11230');
  lines.push('Available: '+variants.join(', '));
  lines.push('Apple says: '+(quote||'Available for pickup'));
  lines.push('Map: https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(['Apple',store.storeName,streetOf(a),a.city,a.state].filter(Boolean).join(' ')));
  lines.push('');
 }
 lines.push('BUY NOW: '+BUY_URL,'Choose the color/storage above, then pick up at this store.','','Checked twice. Not reserved. Stock can disappear within minutes.');
 const first=groups[0],more=items.length-1;
 return {subject:'🚨 iPhone Duo in stock — '+first.store.storeName+' — '+first.variants[0]+(more?' (+'+more+' more)':''),text:lines.join('\n'),url:BUY_URL};
}
module.exports={CENTER_ZIP,RADIUS_MILES,CORE_SEEDS,EDGE_SEEDS,zipOf,distanceMiles,normalizeLocalStore,makeLocalEmail};
