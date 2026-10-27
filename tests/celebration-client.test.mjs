import {test} from 'node:test';
import assert from 'node:assert/strict';
import {request} from '../lib/celebration/client.js';

test('canceling an optional draft aborts its POST transport',async()=>{
 const before=globalThis.fetch;const controller=new AbortController();let signal;
 globalThis.fetch=async(_url,options)=>{signal=options.signal;return new Response(JSON.stringify({ok:true,result:{text:'A draft'}}));};
 try {await request({action:'draft-message'},{signal:controller.signal});assert.equal(signal,controller.signal);controller.abort();assert.equal(signal.aborted,true);}
 finally{globalThis.fetch=before;}
});
test('an AI timeout ends the wait without claiming a save failed or retrying',async()=>{
 const before=globalThis.fetch;let calls=0;let timer;
 globalThis.fetch=async(_url,options)=>{calls++;return await new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});});};
 try {
  await Promise.race([
   assert.rejects(()=>request({action:'draft-message'},{timeoutMs:10}),e=>e.messageKey==='ai.unavailable'),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Draft did not time out')),250);}),
  ]);
  assert.equal(calls,1);
 } finally {clearTimeout(timer);globalThis.fetch=before;}
});
test('an uncertain record save remains unconfirmed and never retries itself',async()=>{
 const before=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw new Error('Connection ended');};
 try {await assert.rejects(()=>request({action:'create-post'}),e=>e.messageKey==='error.saveUnconfirmed');assert.equal(calls,1);}
 finally{globalThis.fetch=before;}
});
test('print waits for pictures, refuses broken images and bounds a font that never loads',async()=>{
 const {waitForPrintPictures}=await import('../lib/celebration/print.js');let decoded=false;
 const picture={loading:'lazy',decode:async()=>{decoded=true;}};
 const page={fonts:{ready:Promise.resolve()},querySelector:()=>null,querySelectorAll:()=>[picture]};
 await waitForPrintPictures(page);assert.equal(decoded,true);assert.equal(picture.loading,'eager');
 await assert.rejects(()=>waitForPrintPictures({...page,querySelector:()=>({})}));
 await assert.rejects(()=>waitForPrintPictures({...page,querySelectorAll:()=>[{decode:async()=>{throw new Error('broken');}}]}));
 await assert.rejects(()=>waitForPrintPictures({...page,fonts:{ready:new Promise(()=>{})}},10));
});
