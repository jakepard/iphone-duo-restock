'use strict';
const nodemailer=require('nodemailer');
async function sendEmail({subject,text}){
const from=process.env.GMAIL_ADDRESS?.trim();
const pass=process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g,'');
const to=process.env.EMAIL_TO?.trim()||from;
if(!from||!pass||!to||!from.includes('@')||!to.includes('@'))throw Error('Missing Gmail email configuration');
const transporter=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:from,pass},connectionTimeout:12000,greetingTimeout:12000,socketTimeout:18000});
await transporter.sendMail({from,to,subject,text});
}
module.exports={sendEmail};
