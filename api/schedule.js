'use strict';
const {timingSafeEqual}=require('node:crypto');
const {Redis}=require('@upstash/redis');
const {runMonitor}=require('../lib/runner');
const {sendEmail}=require('../lib/mail');
function isSchedulerAuthorized(header,secret){
 if(!secret||secret.length<24||typeof header!=='string')return false;
 const actual=Buffer.from(header),expected=Buffer.from('Bearer '+secret);
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='POST')return res.status(405).json({status:'error',error:'POST required'});
 if(!isSchedulerAuthorized(req.headers.authorization,process.env.EXTERNAL_SCHEDULER_SECRET))return res.status(401).json({status:'unauthorized'});
 try{
  if(!process.env.UPSTASH_REDIS_REST_URL||!process.env.UPSTASH_REDIS_REST_TOKEN)throw Error('Missing Redis configuration');
  const mode=req.query?.mode==='hotspot'?'hotspot':'full';
  // This separate credential can ONLY run stock checks: no test-email, pause/resume, or arbitrary mail.
  const scanOptions=mode==='hotspot'?{coreSeeds:['11230'],edgeSeeds:[],edgeBatch:0}:{};
  const result=await runMonitor({redis:Redis.fromEnv(),sendEmail,...scanOptions});
  if(result.retryAfter)res.setHeader('Retry-After',String(Math.max(1,Math.ceil((Date.parse(result.retryAfter)-Date.now())/1000))));
  return res.status(['failed','rate-limited','provider-blocked','cooldown'].includes(result.status)?503:result.status==='busy'?202:200).json({scanMode:mode,...result});
 }catch(error){
  console.error('External scheduler check failed',error?.message||error);
  return res.status(502).json({status:'error',error:'Scanner failed; inspect Vercel runtime logs'});
 }
};
