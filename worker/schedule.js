'use strict';
const clampSeconds=(value,fallback,min=5,max=3600)=>{
 const n=Number(value);
 return Number.isFinite(n)&&n>=min&&n<=max?Math.floor(n):fallback;
};
const chooseScan=(now,lastFullAt,fullEveryMs)=>!lastFullAt||now-lastFullAt>=fullEveryMs?'full':'hotspot';
function chooseDelay(result,pollMs,now=Date.now()){
 if(result?.status==='paused')return Math.max(pollMs,15000);
 if(result?.status==='rate-limited'||result?.status==='cooldown'){
  const until=Date.parse(result.retryAfter||'');
  return Math.max(pollMs,Number.isFinite(until)?until-now:15*60000);
 }
 if(result?.status==='busy')return Math.max(pollMs,10000);
 return pollMs;
}
module.exports={clampSeconds,chooseScan,chooseDelay};
