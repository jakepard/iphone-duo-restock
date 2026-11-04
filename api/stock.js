'use strict';
const {Redis}=require('@upstash/redis');
const {KEY,PAUSED_KEY}=require('../lib/runner');
const {toPublicFeed}=require('../lib/stock');
module.exports=async(req,res)=>{
res.setHeader('Cache-Control','public,max-age=15');
if(req.method!=='GET')return res.status(405).json({error:'GET required'});
try{
if(!process.env.UPSTASH_REDIS_REST_URL||!process.env.UPSTASH_REDIS_REST_TOKEN)return res.status(503).json({status:'setup-required'});
const redis=Redis.fromEnv();
const [data,paused]=await Promise.all([redis.get(KEY),redis.get(PAUSED_KEY)]);
const feed=toPublicFeed(data);
feed.monitorPaused=Boolean(paused);
feed.lastSuccessfulScan=data?.lastSuccess||null;
feed.cooldownUntil=data?.blockedUntil&&Number(data.blockedUntil)>Date.now()?new Date(data.blockedUntil).toISOString():null;
feed.lastBatch={...feed.lastBatch,successfulChecks:Number(data?.lastBatch?.successfulChecks)||0};
const providerError=String(data?.lastError||'');
feed.lastProviderIssue=!providerError?null:
  providerError.includes('HTTP 403')?'Inventory provider rejected requests (403)':
  providerError.includes('HTTP 429')?'Inventory provider rate limited requests (429)':
  providerError.includes('HTTP 541')?'Inventory provider rejected pickup request (HTTP 541)':
  providerError.includes('Apple pickup HTTP')?providerError.slice(0,90):
  /Unexpected|empty/i.test(providerError)?'Unexpected inventory provider response':
  /timeout|aborted/i.test(providerError)?'Inventory provider timed out':
  /fetch failed/i.test(providerError)?'Unable to reach inventory service':
  'Inventory provider error';
if(feed.monitorPaused)feed.status='paused';
return res.status(200).json(feed);
}catch(err){console.error('stock feed failed',err?.message||err);return res.status(502).json({status:'unavailable',message:'Inventory feed temporarily unavailable'});}
};
