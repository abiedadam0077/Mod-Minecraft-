import {chromium,expect} from '@playwright/test';
import bundled from '@sparticuz/chromium';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {execFileSync} from 'node:child_process';
// Supply Chromium runtime libraries on minimal Linux workspaces.
if(process.platform==='linux'&&process.arch==='x64'){
 fs.mkdirSync('/tmp/craftly-chromium-libs',{recursive:true});
 fs.writeFileSync('/tmp/craftly-chromium-libs/runtime.tar',zlib.brotliDecompressSync(fs.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')));
 execFileSync('tar',['-xf','/tmp/craftly-chromium-libs/runtime.tar','-C','/tmp/craftly-chromium-libs']);
 process.env.LD_LIBRARY_PATH='/tmp/craftly-chromium-libs/lib:'+(process.env.LD_LIBRARY_PATH||'');
}
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5199','--strictPort'],{stdio:['ignore','pipe','pipe']});
let browser;
try{
 await once(server.stdout,'data');
 browser=await chromium.launch({executablePath:await bundled.executablePath(),args:bundled.args,headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 let role='admin',signedIn=false,mods=[],favorites=[],ratings=[],history=[];let uploads=0,signedRequests=0;
 const uid='10000000-0000-4000-8000-000000000001';
 const now=Math.floor(Date.now()/1000);
 const jwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',aud:'authenticated',exp:now+3600,iat:now})).toString('base64url')+'.testsignature';
 const user=()=>({id:uid,email:'fixture@example.test',role:'authenticated',aud:'authenticated',created_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{name:'Test Explorer'}});
 const session=()=>({access_token:jwt,refresh_token:'test-refresh-only',token_type:'bearer',expires_in:3600,expires_at:now+3600,user:user()});
 await page.route('https://vvypjqmskdtajkeogzmu.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname,method=req.method();
  const json=async(data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
  if(method==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,PUT'}});
  if(p.endsWith('/auth/v1/token')){signedIn=true;return json(session());}
  if(p.endsWith('/auth/v1/user'))return json(user());
  if(p.endsWith('/auth/v1/logout')){signedIn=false;return json({});}
  if(p.endsWith('/auth/v1/signup'))return json({user:user(),session:null});
  if(p.endsWith('/auth/v1/resend'))return json({});
  if(p.startsWith('/storage/v1/object/public/'))return route.fulfill({contentType:'image/webp',body:fs.readFileSync('public/images/cottage.webp')});
  if(p.startsWith('/storage/v1/object/sign/')&&method==='POST'){signedRequests++;return json({signedURL:p.replace('/storage/v1','')+'?token=test-signed-token'});}
  if(p.startsWith('/storage/v1/object/sign/')&&method==='GET')return route.fulfill({contentType:'application/octet-stream',body:Buffer.from('504b0506000000000000000000000000000000000000','hex')});
  if(p.startsWith('/storage/v1/object/')){if(method==='POST')uploads++;return json({Key:'test',Id:'test'});}
  const table=p.split('/').at(-1),single=req.headers()['accept']?.includes('vnd.pgrst.object');
  const data=method==='GET'?{}:req.postDataJSON()||{};
  if(table==='craftly_profiles')return json({id:uid,display_name:'Cloud Explorer',role});
  if(table==='craftly_mod_stats')return json(mods.map(m=>({mod_id:m.id,rating:ratings.length?5:4.5,rating_count:ratings.length,download_requests:history.length})));
  if(table==='craftly_mods'){
   if(method==='POST'){const row={...data,created_at:new Date().toISOString()};mods.push(row);return json(row,201);}
   if(method==='DELETE'){mods=[];favorites=[];return json([]);}
   if(single)return json(mods.find(m=>url.searchParams.get('id')==='eq.'+m.id));
   return json(mods);
  }
  if(table==='craftly_favorites'){if(method==='POST')favorites.push(data);if(method==='DELETE')favorites=[];return json(method==='GET'?favorites:[]);}
  if(table==='craftly_ratings'){ratings=[data];return json([]);}
  if(table==='craftly_record_download'){history=[{mod_id:data.p_mod_id,requested_at:new Date().toISOString(),craftly_mods:mods[0]}];return json(null);}
  if(table==='craftly_downloads')return json(history);
  throw Error('Unexpected Supabase request: '+method+' '+url);
 });
 await page.goto('http://127.0.0.1:5199/?admin=1');
 await page.locator('[data-action="admin-login"]').click();
 await page.locator('[name="email"]').fill('fixture@example.test');await page.locator('[name="password"]').fill('test-fixture-password');
 await page.locator('#auth-form [type="submit"]').click();await page.locator('[data-action="upload"]').waitFor();
 await page.locator('[data-action="upload"]').click();
 await page.locator('[name="title"]').fill('Cloud test pack');await page.locator('textarea[name="description"]').fill('A disposable mocked package for browser tests.');
 await page.locator('[name="image"]').setInputFiles('public/images/cottage.webp');
 await page.locator('[name="file"]').setInputFiles({name:'fixture.mcpack',mimeType:'application/octet-stream',buffer:Buffer.from('504b0506000000000000000000000000000000000000','hex')});
 await page.locator('[type="checkbox"]').check();await page.locator('#upload-form [type="submit"]').click();
 await page.locator('.admin-row').filter({hasText:'Cloud test pack'}).waitFor();expect(uploads).toBe(2);
 await page.locator('.sidebar button[data-page="discover"]').click();
 await page.locator('[data-favorite]').first().click();await expect(page.locator('[data-favorite]').first()).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-mod]').first().click();await page.locator('[data-rate][data-value="5"]').click();
 await expect(page.locator('.detail-stats')).toContainText('5.0');
 await page.locator('[data-download]').click();await page.locator('.download-success').waitFor();expect(signedRequests).toBe(1);
 await page.locator('[data-action="close"]').first().click();await page.locator('.sidebar [data-page="downloads"]').click();await expect(page.locator('.download-list')).toContainText('Cloud test pack');
 await page.reload();await page.locator('[data-action="upload"]').waitFor(); // session restoration, ?admin=1
 await page.locator('.admin-row [data-delete]').click();await page.locator('[data-confirm-delete]').click();await expect(page.locator('.admin-row')).toHaveCount(0);
 await page.locator('[data-action="account"]').first().click();await page.locator('[data-action="logout"]').click();
 await page.locator('[data-action="admin-login"]').click();await page.locator('[data-action="close"]').click();
 await page.goto('http://127.0.0.1:5199/');
 await page.locator('[data-action="account"]').first().click();await page.locator('[data-action="register"]').click();
 await page.locator('[name="name"]').fill('New explorer');await page.locator('[name="email"]').fill('new@example.test');await page.locator('[name="password"]').fill('long-test-password');
 await page.locator('#auth-form [type="submit"]').click();await expect(page.locator('.modal')).toContainText('Check your inbox');
 await page.locator('[data-action="close"]').click();
 await page.setViewportSize({width:390,height:844});await page.locator('.topbar [data-action="settings"]').click();await expect(page.locator('.modal')).toContainText('Supabase');await page.locator('[data-action="language"]').last().click();
 expect(await page.locator('html').getAttribute('dir')).toBe('rtl');expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS mocked Supabase UI: admin sign-in, upload, favorites, rating, signed download, history, session restore, deletion, logout, email confirmation, mobile and RTL.');
}finally{await browser?.close();server.kill();}
