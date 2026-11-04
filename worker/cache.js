'use strict';
const {KEY,LOCK,PAUSED_KEY}=require('../lib/runner');
class WorkerCache {
 constructor(remote,{now=()=>Date.now(),pauseRefreshMs=5000}={}){
  this.remote=remote;this.now=now;this.pauseRefreshMs=pauseRefreshMs;
  this.state=null;this.paused=null;this.pauseReadAt=0;this.lock=null;this.dirty=false;
 }
 async init(){
  this.state=await this.remote.get(KEY);
  await this.refreshPause();
 }
 async refreshPause(){
  this.paused=await this.remote.get(PAUSED_KEY);
  this.pauseReadAt=this.now();
 }
 async get(key){
  if(key===KEY)return this.state;
  if(key===LOCK)return this.lock;
  if(key===PAUSED_KEY){
   if(this.paused===null&&this.pauseReadAt===0||this.now()-this.pauseReadAt>=this.pauseRefreshMs)await this.refreshPause();
   return this.paused;
  }
  throw Error('Unsupported key');
 }
 async set(key,value,opts){
  if(key===KEY){this.state=value;this.dirty=true;return 'OK';}
  if(key===LOCK){
   if(opts?.nx&&this.lock)return null;
   this.lock=value;return 'OK';
  }
  throw Error('Unsupported key');
 }
 async del(key){
  if(key===LOCK){this.lock=null;return 1;}
  throw Error('Unsupported key');
 }
 async flush(){
  if(!this.dirty)return;
  await this.remote.set(KEY,this.state);
  this.dirty=false;
 }
}
module.exports={WorkerCache};
