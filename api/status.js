'use strict';
const {Redis}=require('@upstash/redis');
const {KEY}=require('../lib/runner');
const {snapshotState}=require('../lib/logic');
module.exports=async(req,res)=>{
res.setHeader('Cache-Control','public,max-age=30');
if(req.method!=='GET')return res.status(405).json({error:'GET required'});
try{
if(!process.env.UPSTASH_REDIS_REST_URL||!process.env.UPSTASH_REDIS_REST_TOKEN)return res.status(503).json({status:'setup-required'});
const state=snapshotState(await Redis.fromEnv().get(KEY));
return res.status(200).json({status:state.lastRun?'running-or-idle':'not-yet-scanned',lastRun:state.lastRun,lastSuccess:state.lastSuccess,discoveredUSStores:Object.keys(state.stores).length,seenSeedsTotal:state.checkedSeeds,lastBatch:state.lastBatch,providerCooldownUntil:state.blockedUntil>Date.now()?new Date(state.blockedUntil).toISOString():null});
}catch(e){console.error(e?.message||e);return res.status(502).json({status:'unavailable'});}
};
