import test from 'node:test';
import assert from 'node:assert/strict';
import {createQueryCache,shouldShowWelcome} from '../src/cache.js';

test('cache coalesces in-flight reads, respects TTL and refreshes explicitly',async()=>{
 let time=0,calls=0;const cache=createQueryCache({now:()=>time});const load=async()=>++calls;
 assert.deepEqual(await Promise.all([cache.read('catalog:a',load),cache.read('catalog:a',load)]),[1,1]);
 assert.equal(await cache.read('catalog:a',load),1);assert.equal(calls,1);
 time=30001;assert.equal(await cache.read('catalog:a',load),2);
 assert.equal(await cache.read('catalog:a',load,{force:true}),3);
 assert.equal(await cache.read('catalog:b',load),4);
 cache.invalidate('catalog:a');assert.equal(await cache.read('catalog:a',load),5);
 assert.equal(await cache.read('catalog:b',load),4);
});
test('invalidated in-flight results do not become cached after logout/mutation',async()=>{
 const cache=createQueryCache();let resolve;const old=cache.read('private:a',()=>new Promise(r=>resolve=r));
 await Promise.resolve();cache.invalidate();const current=cache.read('private:a',async()=>2);assert.equal(await current,2);
 resolve(1);assert.equal(await old,1);assert.equal(await cache.read('private:a',async()=>3),2);
});
test('failed queries can retry and are not cached',async()=>{
 const cache=createQueryCache();await assert.rejects(cache.read('catalog',()=>Promise.reject(Error('offline'))),/offline/);
 assert.equal(await cache.read('catalog',async()=>42),42);
});
test('welcome requires first visit AND no saved session; seen is not an authentication flag',()=>{
 assert.equal(shouldShowWelcome({hasSession:false,seen:false}),true);
 assert.equal(shouldShowWelcome({hasSession:true,seen:false}),false);
 assert.equal(shouldShowWelcome({hasSession:true,seen:true}),false);
 assert.equal(shouldShowWelcome({hasSession:false,seen:true}),false);
});
