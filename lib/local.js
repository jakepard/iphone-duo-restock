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
 const distance=distanceMiles(center.latitude,center.longitude,geo.latitude,geo.longitude);
 if(distance>RADIUS_MILES)return null;
 return {
  storeNumber:String(store.storeNumber),
  storeName:String(store.storeName||store.storeNumber),
  address:{...store.address,postalCode:postal,city:store.address?.city||geo.city,state:geo.state},
  distanceMiles:Math.round(distance*10)/10,
  partsAvailability:store.partsAvailability||{}
 };
}
function makeLocalEmail(items){
 const {BUY_URL,PARTS}=require('./logic');
 const stores=new Map();
 for(const item of items){
  const s=item.store;
  if(!stores.has(s.storeNumber))stores.set(s.storeNumber,{store:s,variants:new Set()});
  stores.get(s.storeNumber).variants.add(PARTS[item.part]);
 }
 const lines=[
  'ACTION REQUIRED: iPhone Duo pickup restock near ZIP 11230',
  'Confirmed by a second inventory check; availability may change immediately.',
  '',
  'PURCHASE NOW (official Apple site):',
  BUY_URL,
  '',
  'Open the purchase link, choose this exact color/storage, and select pickup at the listed store.',
  'Inventory can disappear before you finish checkout. No phone has been reserved.',
  ''
 ];
 for(const {store,variants} of stores.values()){
  lines.push('STORE: '+store.storeName);
  const street=store.address?.addressLines||store.address?.addressLine1||store.address?.street||store.address?.address1||'';
  lines.push('LOCATION: '+[Array.isArray(street)?street.join(', '):street,store.address?.city,store.address?.state,store.address?.postalCode].filter(Boolean).join(', '));
  const mapsQuery=[store.storeName,Array.isArray(street)?street.join(' '):street,store.address?.city,store.address?.state,store.address?.postalCode].filter(Boolean).join(' ');
  lines.push('MAP: https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(mapsQuery));
  lines.push('FROM 11230: approximately '+store.distanceMiles+' miles (straight-line)');
  lines.push('AVAILABLE CONFIGURATIONS: '+Array.from(variants).join(' / '));
  lines.push('APPLE PURCHASE LINK: '+BUY_URL);
  lines.push('');
 }
 lines.push('This is an automated pickup observation, not a stock guarantee. Confirm availability directly with Apple.');
 return {subject:'🚨 IPHONE DUO RESTOCK — '+items[0].store.storeName+' — '+Array.from(stores.values())[0].variants.size+' configuration(s)',text:lines.join('\n')};
}
module.exports={CENTER_ZIP,RADIUS_MILES,CORE_SEEDS,EDGE_SEEDS,zipOf,distanceMiles,normalizeLocalStore,makeLocalEmail};
