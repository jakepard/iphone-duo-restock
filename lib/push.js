'use strict';
// Optional free phone push. ntfy: install the ntfy iPhone app and subscribe to NTFY_TOPIC (use a long random name).
// Telegram: create a bot with @BotFather, then set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.
async function post(url,body){
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('HTTP '+r.status);
}
function pushChannels(env=process.env){
 const list=[];
 const topic=env.NTFY_TOPIC?.trim();
 if(topic)list.push(['ntfy',({subject,text,url})=>post((env.NTFY_SERVER?.trim()||'https://ntfy.sh').replace(/\/$/,''),{topic,title:subject.slice(0,150),message:text.slice(0,3500),priority:5,tags:['rotating_light'],...(url?{click:url}:{})})]);
 const token=env.TELEGRAM_BOT_TOKEN?.trim(),chat=env.TELEGRAM_CHAT_ID?.trim();
 if(token&&chat)list.push(['telegram',({subject,text})=>post('https://api.telegram.org/bot'+token+'/sendMessage',{chat_id:chat,text:(subject+'\n\n'+text).slice(0,4000),disable_web_page_preview:true})]);
 return list;
}
// Sends to email and every configured push channel. Succeeds if at least one channel delivered.
function withPush(sendEmail,env=process.env){
 return async message=>{
  const channels=[['email',sendEmail],...pushChannels(env)];
  const results=await Promise.allSettled(channels.map(([,send])=>send(message)));
  const sent=channels.filter((_,i)=>results[i].status==='fulfilled').map(([name])=>name);
  const failed=channels.map(([name],i)=>results[i].status==='rejected'?name+': '+String(results[i].reason?.message||results[i].reason).slice(0,80):null).filter(Boolean);
  if(!sent.length)throw Error('All alert channels failed — '+failed.join('; '));
  return {sent,failed};
 };
}
module.exports={pushChannels,withPush};
