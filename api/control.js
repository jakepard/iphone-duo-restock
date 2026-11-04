'use strict';
const {timingSafeEqual}=require('node:crypto');
const {Redis}=require('@upstash/redis');
const {PAUSED_KEY}=require('../lib/runner');
function authorized(header,secret){
 if(!secret||secret.length<24||typeof header!=='string')return false;
 const expected=Buffer.from('Bearer '+secret);
 const actual=Buffer.from(header);
 return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='POST')return res.status(405).json({error:'POST required'});
 if(!authorized(req.headers.authorization,process.env.CRON_SECRET))return res.status(401).json({error:'Unauthorized'});
 const data=typeof req.body==='string'?(()=>{try{return JSON.parse(req.body)}catch{return {}}})():req.body||{};
 if(data.action!=='pause'&&data.action!=='resume')return res.status(400).json({error:'action must be pause or resume'});
 try{
  if(!process.env.UPSTASH_REDIS_REST_URL||!process.env.UPSTASH_REDIS_REST_TOKEN)return res.status(503).json({error:'Database not configured'});
  const redis=Redis.fromEnv();
  if(data.action==='pause')await redis.set(PAUSED_KEY,'1');
  else await redis.del(PAUSED_KEY);
  return res.status(200).json({status:data.action==='pause'?'paused':'resumed',note:data.action==='pause'?'In-progress scan may finish before stopping':'Scheduled scans resume on the next GitHub trigger'});
 }catch(err){console.error('Control update error',err?.message||err);return res.status(500).json({error:'Unable to update monitor status'});}
};
