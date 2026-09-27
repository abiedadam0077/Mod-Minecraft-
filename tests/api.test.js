import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
test('end-to-end API: permissions, upload, downloads, favorites and ratings',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'craftly-api-'));
 const port=32000+Math.floor(Math.random()*10000);
 const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,ADMIN_EMAIL:'admin@test.local',ADMIN_PASSWORD:'Secure-test-password-2026'},stdio:['ignore','pipe','pipe']});
 try{
 await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Server startup timeout')),12000).unref())]);
 const call=async(url,body,token,method=body?'POST':'GET')=>{const res=await fetch(`http://127.0.0.1:${port}/api${url}`,{method,headers:{...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json()};};
 assert.equal((await call('/health')).data.ok,true);
 assert.equal((await call('/admin/stats')).status,401);
 const signup=await call('/auth/register',{name:'Explorer',email:'explorer@test.local',password:'password-2026'});assert.equal(signup.status,200);const token=signup.data.token;
 assert.equal((await call('/admin/stats',null,token)).status,403);
 assert.equal((await call('/auth/register',{name:'Again',email:'explorer@test.local',password:'password-2026'})).status,409);
 const admin=(await call('/auth/login',{email:'admin@test.local',password:'Secure-test-password-2026'})).data.token;
 const mods=(await call('/mods')).data;assert.equal(mods.length,6);assert.equal((await call('/mods/'+mods[0].id+'/download',{},token)).status,409);
 const form=new FormData();for(const [k,v] of Object.entries({title:'Integration test pack',description:'Test fixture package, not a game-ready add-on.',version:'1.21',editorRating:'4.5',category:'Add-ons'}))form.append(k,v);
 form.append('image',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')]),'cover.png');
 const fixture=Buffer.from('504b0506000000000000000000000000000000000000','hex');form.append('file',new Blob([fixture]),'fixture.mcpack');
 const published=await call('/admin/mods',form,admin);assert.equal(published.status,201);const id=published.data.id;assert.equal(published.data.file,undefined);
 assert.deepEqual((await call('/favorites/'+id,{},token)).data,[id]);
 assert.equal((await call('/mods/'+id+'/rating',{rating:5},token)).data.rating,5);
 assert.equal((await call('/mods/'+id+'/rating',{rating:8},token)).status,400);
 const ticket=(await call('/mods/'+id+'/download',{},token)).data;
 const response=await fetch(`http://127.0.0.1:${port}${ticket.url}`);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),fixture);
 assert.equal((await call('/downloads',null,token)).data.length,1);
 assert.equal((await call('/admin/stats',null,admin)).data.mods,1);
 assert.equal((await call('/admin/mods/'+id,null,token,'DELETE')).status,403);
 assert.equal((await call('/admin/mods/'+id,null,admin,'DELETE')).status,200);
 assert.equal((await call('/me',null,token)).data.favorites.length,0);
 assert.equal((await call('/auth/logout',{},token)).status,200);assert.equal((await call('/me',null,token)).status,401);
 }finally{child.kill();await once(child,'exit');fs.rmSync(dir,{recursive:true,force:true});}
});
