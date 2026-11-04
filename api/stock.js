'use strict';
const {Redis}=require('@upstash/redis');
const {KEY}=require('../lib/runner');
const {toPublicFeed}=require('../lib/stock');
module.exports=async(req,res)=>{
res.setHeader('Cache-Control','public,max-age=15');
if(req.method!=='GET')return res.status(405).json({error:'GET required'});
try{
if(!process.env.UPSTASH_REDIS_REST_URL||!process.env.UPSTASH_REDIS_REST_TOKEN)return res.status(503).json({status:'setup-required'});
const feed=toPublicFeed(await Redis.fromEnv().get(KEY));
return res.status(200).json(feed);
}catch(err){console.error('stock feed failed',err?.message||err);return res.status(502).json({status:'unavailable',message:'Inventory feed temporarily unavailable'});}
};
