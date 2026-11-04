'use strict';
async function sendEmailOverHttps({subject,text}){
 const base=process.env.ALERT_RELAY_URL,secret=process.env.ALERT_RELAY_SECRET;
 if(!base||!secret||!/^https:\/\//i.test(base)||secret.length<24)throw Error('Missing valid ALERT_RELAY_URL or ALERT_RELAY_SECRET');
 const response=await fetch(new URL('/api/notify',base),{
  method:'POST',
  headers:{'Authorization':'Bearer '+secret,'Content-Type':'application/json'},
  body:JSON.stringify({subject,text}),signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error('Alert relay HTTP '+response.status);
}
module.exports={sendEmailOverHttps};
