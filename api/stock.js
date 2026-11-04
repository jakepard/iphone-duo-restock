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
if(feed.monitorPaused)feed.status='paused';
return res.status(200).json(feed);
}catch(err){console.error('stock feed failed',err?.message||err);return res.status(502).json({status:'unavailable',message:'Inventory feed temporarily unavailable'});}
};
