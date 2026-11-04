'use strict';
const {Redis}=require('@upstash/redis');
const {runMonitor}=require('../lib/runner');
const {WorkerCache}=require('./cache');
const {sendEmailOverHttps}=require('./relay');
const {clampSeconds,chooseScan,chooseDelay}=require('./schedule');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pollMs=clampSeconds(process.env.HOTSPOT_INTERVAL_SECONDS,30)*1000;
const fullMs=clampSeconds(process.env.FULL_RADIUS_INTERVAL_SECONDS,120,30,7200)*1000;
const syncMs=clampSeconds(process.env.DASHBOARD_SYNC_SECONDS,60,15,3600)*1000;
let running=true;
process.once('SIGINT',()=>{running=false;});
process.once('SIGTERM',()=>{running=false;});
async function main(){
 const redis=Redis.fromEnv();
 const cache=new WorkerCache(redis);
 await cache.init();
 let lastFull=0,lastSynced=Date.now(),consecutiveErrors=0;
 console.log(JSON.stringify({event:'worker-start',hotspotIntervalSeconds:pollMs/1000,fullRadiusIntervalSeconds:fullMs/1000,warning:'Intervals are best-effort and subject to source limits'}));
 while(running){
  const start=Date.now(),mode=chooseScan(start,lastFull,fullMs);
  let result=null,delayMs=pollMs;
  try{
   // A single instance runs the entire loop; the GitHub Actions inventory schedule must be disabled when deploying this worker.
   const opts=mode==='hotspot'?{coreSeeds:['11230'],edgeSeeds:[],edgeBatch:0}:undefined;
   result=await runMonitor({redis:cache,sendEmail:sendEmailOverHttps,...(opts||{})});
   if(mode==='full'&&result.status!=='busy')lastFull=start;
   if(result.alerts||Date.now()-lastSynced>=syncMs){await cache.flush();lastSynced=Date.now();}
   console.log(JSON.stringify({event:'scan',time:new Date().toISOString(),mode,...result}));
   consecutiveErrors=result.status==='partial'?consecutiveErrors+1:0;
   delayMs=chooseDelay(result,pollMs);
   if(consecutiveErrors>=3)delayMs=Math.max(delayMs,60000);
  }catch(e){
   consecutiveErrors++;
   console.error(JSON.stringify({event:'error',time:new Date().toISOString(),message:String(e?.message||e).slice(0,250)}));
   delayMs=Math.min(15*60000,Math.max(30000,5000*Math.pow(2,Math.min(8,consecutiveErrors))));
  }
  const elapsed=Date.now()-start;
  if(running)await sleep(Math.max(1000,delayMs-elapsed));
 }
 await cache.flush();
 console.log(JSON.stringify({event:'worker-stopped',time:new Date().toISOString()}));
}
if(require.main===module)main().catch(err=>{console.error('Worker stopped',err?.message||err);process.exitCode=1;});
module.exports={main};
