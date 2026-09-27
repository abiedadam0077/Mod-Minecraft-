import test from 'node:test';
import assert from 'node:assert/strict';
import {createTransfers} from '../src/transfers.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
const mod={id:'pack-1',title:'Test',image:'cover.webp',size:6};
test('native transfer lifecycle, real progress, restore and storage safety',async()=>{
 const calls=[],storage=memory();const native={startDownload:(...args)=>calls.push(args),pauseDownload:id=>calls.push(['pause',id]),cancelDownload:id=>calls.push(['cancel',id]),hasDownload:()=>true,openDownload:n=>calls.push(['open',n]),clearDownloads:()=>true};
 const tm=createTransfers({native,storage,ticket:async()=>({url:'https://example.test/signed',filename:'pack.mcpack'})});tm.setOwner('alice');await tm.start(mod);
 assert.equal(calls[0][0],mod.id);tm.receive({id:mod.id,status:'running',bytes:2,total:6,speed:100});assert.equal(tm.jobs.get(mod.id).bytes,2);
 assert.throws(()=>tm.clear(),/Finish or cancel/);tm.pause(mod.id);assert.equal(tm.jobs.get(mod.id).status,'paused');await tm.resume(mod.id);assert.equal(calls.at(-1)[3],true);
 tm.receive({id:mod.id,status:'complete',bytes:6,total:6,speed:0});tm.open(mod.id);assert.deepEqual(calls.at(-1),['open','pack.mcpack']);
 const restored=createTransfers({native,storage,ticket:async()=>{}});restored.setOwner('alice');assert.equal(restored.jobs.get(mod.id).available,true);restored.clear();assert.equal(restored.jobs.size,0);
 tm.setOwner('bob');assert.equal(tm.jobs.size,0);
});
test('pause/resume race, HTTP Range fallback, completion and canceled preparation',async()=>{
 const fetchBefore=globalThis.fetch,documentBefore=globalThis.document;let requested=[];
 globalThis.document={createElement:()=>({click(){}})};
 let firstController,firstSignal;
 globalThis.fetch=async(url,options)=>{requested.push(options.headers);if(requested.length===1){firstSignal=options.signal;return new Response(new ReadableStream({start(c){firstController=c;c.enqueue(new Uint8Array([80,75]));firstSignal.addEventListener('abort',()=>c.error(new DOMException('Aborted','AbortError')));}}),{status:200,headers:{'Content-Length':'6'}});}return new Response(new Uint8Array([80,75,1,2,3,4]),{status:200,headers:{'Content-Length':'6'}});};
 try{const tm=createTransfers({storage:memory(),ticket:async()=>({url:'https://example.test/signed',filename:'pack.mcpack'})});const initial=tm.start(mod);
  // Wait for actual bytes, never use a fake timer-driven progress value.
  while(tm.jobs.get(mod.id)?.bytes!==2)await new Promise(r=>setImmediate(r));
  tm.pause(mod.id);const resumed=tm.resume(mod.id);await Promise.all([initial,resumed]);
  assert.equal(requested[1].Range,'bytes=2-');assert.equal(tm.jobs.get(mod.id).status,'complete');assert.equal(tm.jobs.get(mod.id).bytes,6);assert.equal(tm.jobs.get(mod.id).available,true);tm.clear();
  let release;const pending=createTransfers({storage:memory(),ticket:()=>new Promise(r=>release=r)});const start=pending.start(mod);pending.cancel(mod.id);release({url:'https://example.test/signed',filename:'pack.mcpack'});await start;assert.equal(pending.jobs.get(mod.id).status,'canceled');assert.equal(requested.length,2);
 }finally{globalThis.fetch=fetchBefore;globalThis.document=documentBefore;}
});
