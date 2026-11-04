'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const scheduler=require('../api/schedule');
function fakeReq(headers={},method='POST'){return{method,headers,query:{mode:'hotspot'}}}
function fakeRes(){return{code:200,status(code){this.code=code;return this},setHeader(){return this},json(value){this.body=value;return this}}}
test('scheduler endpoint forbids missing authorization',async()=>{
 const res=fakeRes();
 await scheduler(fakeReq(),res);
 assert.equal(res.code,401);
 assert.equal(res.body.status,'unauthorized');
});
test('scheduler endpoint accepts only POST',async()=>{
 const res=fakeRes();
 await scheduler(fakeReq({},'GET'),res);
 assert.equal(res.code,405);
});
test('scheduler endpoint forbids token whose length is shorter than 24 characters',async()=>{
 const before=process.env.EXTERNAL_SCHEDULER_SECRET;
 try{
  process.env.EXTERNAL_SCHEDULER_SECRET='short';
  const res=fakeRes();await scheduler(fakeReq({authorization:'Bearer short'}),res);
  assert.equal(res.code,401);
 }finally{
  if(before===undefined)delete process.env.EXTERNAL_SCHEDULER_SECRET;
  else process.env.EXTERNAL_SCHEDULER_SECRET=before;
 }
});
