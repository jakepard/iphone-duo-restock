'use strict';
const {timingSafeEqual}=require('node:crypto');
const {sendEmail}=require('../lib/mail');
function isAuthorized(value,secret){
 if(typeof value!=='string'||!secret||secret.length<24)return false;
 const got=Buffer.from(value),expected=Buffer.from('Bearer '+secret);
 return got.length===expected.length&&timingSafeEqual(got,expected);
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='POST')return res.status(405).json({error:'POST required'});
 if(!isAuthorized(req.headers.authorization,process.env.CRON_SECRET))return res.status(401).json({error:'Unauthorized'});
 try{
  const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  if(typeof b.subject!=='string'||typeof b.text!=='string'||b.subject.length>180||b.text.length>12000||b.subject.length<8||b.text.length<20)return res.status(400).json({error:'Invalid email payload'});
  // This endpoint is private; it only sends to the configured recipient, never a user-provided address.
  await sendEmail({subject:b.subject,text:b.text});
  return res.status(200).json({status:'sent'});
 }catch(e){console.error('Email relay failure',e?.message||e);return res.status(502).json({error:'Notification could not be delivered'});}
};
