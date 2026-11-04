'use strict';
const {timingSafeEqual}=require('node:crypto');
const {Redis}=require('@upstash/redis');
const {runMonitor}=require('../lib/runner');
const {sendEmail}=require('../lib/mail');
const {withPush}=require('../lib/push');
function authorized(header,secret){
if(!secret||secret.length<24||typeof header!=='string')return false;
const expected=Buffer.from('Bearer '+secret),actual=Buffer.from(header);
return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
module.exports=async(req,res)=>{
res.setHeader('Cache-Control','private, no-store');
if(req.method!=='POST')return res.status(405).json({error:'POST required'});
if(!authorized(req.headers.authorization,process.env.CRON_SECRET))return res.status(401).json({error:'Unauthorized'});
try{
if(!process.env.UPSTASH_REDIS_REST_URL||!process.env.UPSTASH_REDIS_REST_TOKEN)throw Error('Missing database configuration');
if(req.query.test==='email'){const delivery=await withPush(sendEmail)({subject:'TEST: iPhone Duo stock tracker connected',text:'Alerts are working. This is a test, not an actual restock.',url:'https://iphone-duo-restock.vercel.app'});return res.status(200).json({status:'test-email-sent',...delivery});}
const mode=req.query.mode==='hotspot'?'hotspot':'full';
const scanOptions=mode==='hotspot'?{coreSeeds:['11230'],edgeSeeds:[],edgeBatch:0}:{};
const result=await runMonitor({redis:Redis.fromEnv(),sendEmail:withPush(sendEmail),...scanOptions});
result.scanMode=mode;
if(result.retryAfter)res.setHeader('Retry-After',String(Math.max(1,Math.ceil((Date.parse(result.retryAfter)-Date.now())/1000))));
return res.status(['failed','rate-limited','provider-blocked'].includes(result.status)?503:200).json(result);
}catch(err){console.error('check failed',err?.message||err);return res.status(500).json({status:'error',error:'Check Vercel function logs'});}
};
