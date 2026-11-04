'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {clampSeconds,chooseScan,chooseDelay}=require('../worker/schedule');
const {WorkerCache}=require('../worker/cache');
const {KEY,LOCK,PAUSED_KEY}=require('../lib/runner');
test('configurable schedule starts with full scan then hotspot checks',()=>{
 assert.equal(clampSeconds('10',30),10);
 assert.equal(clampSeconds('1',30),30);
 assert.equal(chooseScan(100000,0,120000),'full');
 assert.equal(chooseScan(100000,90000,120000),'hotspot');
 assert.equal(chooseScan(220000,90000,120000),'full');
});
test('cooldown and pause slow scanning',()=>{
 assert.ok(chooseDelay({status:'rate-limited'},30000)>=900000);
 assert.ok(chooseDelay({status:'paused'},5000)>=15000);
});
test('memory cache avoids remote reads and writes during each scan',async()=>{
 let reads=0,writes=0,remoteState={v:1,inventory:{}};
 const store={async get(k){reads++;return k===KEY?remoteState:null;},async set(k,v){writes++;remoteState=v;return 'OK';}};
 const c=new WorkerCache(store,{now:()=>15000,pauseRefreshMs:5000});
 await c.init();
 assert.equal(await c.get(KEY),remoteState);
 await c.set(LOCK,'abc',{nx:true});assert.equal(await c.get(LOCK),'abc');
 await c.set(KEY,{v:1,inventory:{a:1}});
 assert.equal(writes,0);await c.flush();assert.equal(writes,1);
 assert.equal((await c.get(KEY)).inventory.a,1);
 await c.get(PAUSED_KEY);assert.equal(reads,2);
});
