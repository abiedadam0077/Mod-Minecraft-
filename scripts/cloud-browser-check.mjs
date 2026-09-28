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
 let role='admin',signedIn=false,mods=[],favorites=[],ratings=[],history=[];let uploads=0,signedRequests=0,cleanupRequests=0,catalogReads=0,pagedReads=0,historyReads=0,rejectNextPackage=true;
 const uid='10000000-0000-4000-8000-000000000001';
 const now=Math.floor(Date.now()/1000);
 const jwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',aud:'authenticated',exp:now+3600,iat:now})).toString('base64url')+'.testsignature';
 const user=()=>({id:uid,email:'fixture@example.test',role:'authenticated',aud:'authenticated',created_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{name:'Test Explorer'}});
 const session=()=>({access_token:jwt,refresh_token:'test-refresh-only',token_type:'bearer',expires_in:3600,expires_at:now+3600,user:user()});
 await page.route('https://vvypjqmskdtajkeogzmu.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname,method=req.method();
  const json=async(data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
  if(method==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,PUT'}});
  if(p.endsWith('/functions/v1/content-hub'))return json({error:'Written metadata/cache permission is not configured.'},400);
  if(p.endsWith('/auth/v1/token')){signedIn=true;return json(session());}
  if(p.endsWith('/auth/v1/user'))return json(user());
  if(p.endsWith('/auth/v1/logout')){signedIn=false;return json({});}
  if(p.endsWith('/auth/v1/signup'))return json({user:user(),session:null});
  if(p.endsWith('/auth/v1/resend'))return json({});
  if(p.startsWith('/storage/v1/object/public/'))return route.fulfill({contentType:'image/webp',body:fs.readFileSync('public/images/'+(p.includes('sample0')?'overworld':p.includes('sample1')?'dragon':'cottage')+'.webp')});
  if(p.startsWith('/storage/v1/object/sign/')&&method==='POST'){signedRequests++;return json({signedURL:p.replace('/storage/v1','')+'?token=test-signed-token'});}
  if(p.startsWith('/storage/v1/object/sign/')&&method==='GET')return route.fulfill({contentType:'application/octet-stream',body:Buffer.from('504b0506000000000000000000000000000000000000','hex')});
  if(p.startsWith('/storage/v1/object/')){if(method==='DELETE')cleanupRequests++;if(method==='POST'){uploads++;if(p.includes('craftly-packages')){await new Promise(r=>setTimeout(r,400));if(rejectNextPackage){rejectNextPackage=false;return json({message:'Fixture upload failed. Please retry.',error:'Fixture upload failed',statusCode:'400'},400);}}}return json({Key:'test',Id:'test'});}
  const table=p.split('/').at(-1),single=req.headers()['accept']?.includes('vnd.pgrst.object');
  const data=method==='GET'?{}:req.postDataJSON()||{};
  if(table==='craftly_catalog_page'){
   if(process.env.LEGACY_SCHEMA==='1')return json({code:'PGRST202',message:'RPC not installed'},404);
   pagedReads++;let rows=mods.filter(m=>(data.p_category==='All mods'||m.category===data.p_category||data.p_category==='Maps / Worlds'&&['Maps','Worlds'].includes(m.category))&&(data.p_version==='all'||m.minecraft_version===data.p_version||m.minecraft_version.startsWith(data.p_version+'.'))&&(data.p_source==='all'||(m.source||'manual')===data.p_source)&&(!data.p_ids||data.p_ids.includes(m.id))&&((m.title+' '+m.description).toLowerCase().includes(data.p_search.toLowerCase()))).map(m=>({...m,rating:ratings.length?5:m.editor_rating,rating_count:ratings.length,download_requests:history.length})).filter(m=>!data.p_rating||m.rating>=data.p_rating);
   rows.sort(data.p_sort==='downloads'?(a,b)=>(b.source_downloads||b.download_requests)-(a.source_downloads||a.download_requests):data.p_sort==='rating'?(a,b)=>(b.rating||0)-(a.rating||0):(a,b)=>new Date(data.p_sort==='updated'?(b.updated_at||b.created_at):b.created_at)-new Date(data.p_sort==='updated'?(a.updated_at||a.created_at):a.created_at));return json({items:rows.slice(data.p_offset,data.p_offset+data.p_limit),hasMore:rows.length>data.p_offset+data.p_limit});
  }
  if(table==='craftly_sources')return process.env.LEGACY_SCHEMA==='1'?json({code:'42P01',message:'Not installed'},404):json([{id:'creator-feed',name:'Approved creator feed',enabled:false,status:'Disabled',last_sync:null,imported_items:0,new_items:0,updated_items:0,failed_items:0}]);
  if(table==='craftly_profiles')return json({id:uid,display_name:'Cloud Explorer',role});
  if(table==='craftly_mod_stats')return json(mods.map(m=>({mod_id:m.id,rating:ratings.length?5:4.5,rating_count:ratings.length,download_requests:history.length})));
  if(table==='craftly_mods'){
   if(method==='POST'){const row={...data,created_at:new Date().toISOString()};mods.push(row);return json(row,201);}
   if(method==='DELETE'){mods=[];favorites=[];return json([]);}
   if(single)return json(mods.find(m=>url.searchParams.get('id')==='eq.'+m.id));
   catalogReads++;return json(mods);
  }
  if(table==='craftly_favorites'){if(method==='POST')favorites.push(data);if(method==='DELETE')favorites=[];return json(method==='GET'?favorites:[]);}
  if(table==='craftly_ratings'){ratings=[data];return json([]);}
  if(table==='craftly_record_download'){history=[{mod_id:data.p_mod_id,requested_at:new Date().toISOString(),craftly_mods:mods[0]}];return json(null);}
  if(table==='craftly_downloads'){historyReads++;return json(history);}
  throw Error('Unexpected Supabase request: '+method+' '+url);
 });
 await page.goto('http://127.0.0.1:5199/?admin=1',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#startup-splash')).toBeVisible();
 await expect(page.locator('.welcome-screen')).toBeVisible({timeout:8000});
 await expect(page.locator('#startup-splash')).toHaveCount(0);
 expect(catalogReads).toBe(0); // First-run welcome doesn't eagerly load the catalog.
 if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:process.env.SCREENSHOT_DIR+'/welcome.png'});await page.setViewportSize({width:1280,height:900});}
 await page.locator('[data-action="admin-login"]').click();
 await page.locator('[name="email"]').fill('fixture@example.test');await page.locator('[name="password"]').fill('test-fixture-password');
 await page.locator('#auth-form [type="submit"]').click();await page.locator('[data-action="upload"]').first().waitFor();
 await page.locator('[data-action="upload"]').first().click();
 await page.locator('[name="title"]').fill('Cloud test pack');await page.locator('textarea[name="description"]').fill('A disposable mocked package for browser tests.');
 await page.locator('[name="image"]').setInputFiles('public/images/cottage.webp');
 await page.locator('[name="file"]').setInputFiles({name:'fixture.mcpack',mimeType:'application/octet-stream',buffer:Buffer.from('504b0506000000000000000000000000000000000000','hex')});
 await expect(page.locator('#upload-form input[type="checkbox"]')).toHaveCount(0);
 await expect(page.locator('.declaration-switch')).toHaveAttribute('aria-checked','true');
 await expect(page.locator('.publish-declaration')).toContainText('I have permission to distribute this content and have tested it in Minecraft.');
 await expect(page.locator('#title-count')).toHaveText('15/80');
 await expect(page.locator('#cover-preview img')).toBeVisible();
 await expect(page.locator('#package-file-status')).toContainText('MCPACK');
 if(process.env.SCREENSHOT_DIR){await page.setViewportSize({width:390,height:844});await page.screenshot({path:process.env.SCREENSHOT_DIR+'/publish.png'});await page.locator('.upload-modal').evaluate(el=>el.scrollTop=el.scrollHeight);await page.screenshot({path:process.env.SCREENSHOT_DIR+'/publish-files.png'});}
 await page.locator('#upload-form [type="submit"]').click();
 await expect(page.locator('#upload-progress')).toContainText('Uploading Minecraft package',{timeout:15000}).catch(async e=>{console.log('UPLOAD STAGE DEBUG',await page.locator('.form-error').allTextContents(),errors,uploads);throw e;});
 await expect(page.locator('#publish-title')).toBeDisabled();
 await page.locator('.publish-header [data-action="close"]').click();await expect(page.locator('#upload-form')).toBeVisible();
 await expect(page.locator('.form-error')).toContainText('Fixture upload failed');
 await expect(page.locator('#publish-title')).toBeEnabled();await expect(page.locator('#publish-title')).toHaveValue('Cloud test pack');expect(cleanupRequests).toBe(1);expect(mods.length).toBe(0);
 await page.locator('#upload-form [type="submit"]').click();
 await page.locator('.admin-row').filter({hasText:'Cloud test pack'}).waitFor().catch(async e=>{console.log('PUBLISH DEBUG',await page.locator('body').innerText(),errors,mods);throw e;});expect(uploads).toBe(4);
 expect(catalogReads).toBe(process.env.LEGACY_SCHEMA==='1'?1:0); // No full-catalog reload on publication.
 await page.selectOption('#studio-category','Worlds');await expect(page.locator('.admin-row')).toHaveCount(0);
 await page.selectOption('#studio-category','All mods');await expect(page.locator('.admin-row')).toHaveCount(1);await page.selectOption('#studio-sort','downloads');await expect(page.locator('.admin-row')).toHaveCount(1);
 expect(catalogReads).toBeLessThanOrEqual(process.env.LEGACY_SCHEMA==='1'?3:0);await page.setViewportSize({width:1280,height:900});

 await page.locator('.sidebar button[data-page="discover"]').click();
 await page.locator('.hero-slide:not([inert]) [data-favorite],.mod-card [data-favorite]').first().click();await expect(page.locator('.hero-slide:not([inert]) [data-favorite],.mod-card [data-favorite]').first()).toHaveAttribute('aria-pressed','true');
 await page.locator('.mod-card [data-mod]').first().click();await page.locator('[data-rate][data-value="5"]').click();
 await expect(page.locator('.detail-heading')).toContainText('5.0');
 await page.locator('[data-tab="pictures"]').click();await expect(page.locator('.gallery-image')).toBeVisible();
 await page.locator('[data-tab="changes"]').click();await expect(page.locator('.timeline-entry')).toContainText('Published');
 await page.locator('[data-download]').click();await expect(page.locator('.transfer-detail>h2')).toHaveText('Completed');expect(signedRequests).toBe(1);
 await page.locator('.sidebar [data-page="downloads"]').click();await expect(page.locator('.download-list')).toContainText('Cloud test pack');
 await page.locator('.sidebar [data-page="browse"]').click();
 await page.locator('#search').fill('does not exist');await expect(page.locator('.mod-card')).toHaveCount(0);
 await page.locator('#search').fill('Cloud');await expect(page.locator('.mod-card')).toHaveCount(1);
 await page.locator('.search-filter').click();await page.locator('input[name="rating"][value="5"]').check();await page.locator('#filters-form [type="submit"]').click();await expect(page.locator('.mod-card')).toHaveCount(1);
 await page.locator('.edition-pill').click();await page.locator('input[name="version"][value="1.20"]').check();await page.locator('#version-form [type="submit"]').click();await expect(page.locator('.mod-card')).toHaveCount(0);
 await page.locator('.edition-pill').click();await page.locator('input[name="version"][value="all"]').check();await page.locator('#version-form [type="submit"]').click();
 await page.evaluate(()=>localStorage.removeItem('craftly-welcome-seen-v1'));await page.reload();await page.locator('[data-action="upload"]').first().waitFor();await expect(page.locator('.welcome-screen')).toHaveCount(0);await expect(page.locator('#auth-form')).toHaveCount(0);
 await page.locator('.admin-row [data-delete]').click();await page.locator('[data-confirm-delete]').click();await expect(page.locator('.admin-row')).toHaveCount(0,{timeout:15000}).catch(async e=>{console.log('DELETE DEBUG',await page.locator('#toast').textContent(),errors);throw e;});
 await page.locator('.sidebar [data-page="account"]').click();await page.locator('[data-action="logout-confirm"]').click();await page.locator('[data-action="logout"]').click();
 await page.goto('http://127.0.0.1:5199/');
 await page.locator('.topbar [data-page="account"]').click();await page.locator('[data-action="login"]').click();await page.locator('[data-action="register"]').click();
 await page.locator('[name="name"]').fill('New explorer');await page.locator('[name="email"]').fill('new@example.test');await page.locator('[name="password"]').fill('long-test-password');
 await page.locator('#auth-form [type="submit"]').click();await expect(page.locator('.modal')).toContainText('Check your inbox');
 await page.locator('[data-action="close"]').click();
 // Catalog fixtures are intercepted in this browser only, never uploaded to Supabase.
 const titles=['Natural Horizons','Dragon Realms','Cozy Cottage Life','Better Adventures'];
 mods=titles.map((title,i)=>({id:'20000000-0000-4000-8000-00000000000'+i,title,description:['A little upgrade for a whole new world.','Legendary companions. Endless adventures.','A slower pace. A place to call home.','More to discover around every corner.'][i],category:['Textures','Add-ons','Worlds','Add-ons'][i],minecraft_version:'1.21',editor_rating:4.5,cover_path:'sample'+i+'/cover.webp',package_path:'sample'+i+'/pack.mcpack',file_size:8388608,created_at:new Date(Date.now()-i*86400000).toISOString()}));
 await page.setViewportSize({width:390,height:844});
 await page.locator('.topbar [data-page="account"]').click();await page.locator('[data-action="login"]').click();await page.locator('[name="email"]').fill('fixture@example.test');await page.locator('[name="password"]').fill('test-fixture-password');await page.locator('#auth-form [type="submit"]').click();await page.locator('[data-action="studio"]').last().click();await expect(page.locator('.studio-mod')).toHaveCount(4);await expect(page.locator('.mobile-nav .active')).toHaveCount(1);
 await page.locator('[data-action="sources"]').click();if(process.env.LEGACY_SCHEMA==='1'){await expect(page.locator('.sources-screen .info-note')).toBeVisible();}else{await expect(page.locator('.source-card')).toContainText('Disabled');await expect(page.locator('[data-source-sync]')).toBeDisabled();await page.locator('[data-source-toggle]').click();await expect(page.locator('#toast')).toContainText('permission');await expect(page.locator('.source-state')).toHaveText('Disabled');}
 await page.locator('.mobile-nav [data-page="account"]').click();await page.locator('[data-action="studio"]').last().click();await expect(page.locator('.studio-mod')).toHaveCount(4);

 if(process.env.SCREENSHOT_DIR){await page.locator('.studio-thumb img').evaluateAll(imgs=>Promise.all(imgs.map(i=>Promise.race([i.decode().catch(()=>{}),new Promise(r=>setTimeout(r,2000))]))));await page.locator('#toast').evaluate(el=>el.classList.remove('show'));await page.screenshot({path:process.env.SCREENSHOT_DIR+'/studio.png'});}
 await page.selectOption('#studio-sort','new');await expect(page.locator('.studio-mod-name').first()).toHaveText('Natural Horizons');
 await page.selectOption('#studio-category','Worlds');await expect(page.locator('.studio-mod-name')).toHaveCount(1);await expect(page.locator('.studio-mod-name')).toHaveText('Cozy Cottage Life');await page.selectOption('#studio-category','All mods');
 await page.locator('[data-action="studio-layout"]').click();await expect(page.locator('.studio-grid')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.locator('[data-action="studio-layout"]').click();
 const beforeNav=catalogReads;for(const target of ['browse','favorites','downloads','account'])await page.locator('.mobile-nav [data-page="'+target+'"]').click();expect(catalogReads).toBe(beforeNav);
 await page.locator('.mobile-nav [data-page="downloads"]').click();await page.locator('.mobile-nav [data-page="account"]').click();const oldHistoryReads=historyReads;await page.locator('.mobile-nav [data-page="downloads"]').click();await page.locator('.mobile-nav [data-page="account"]').click();expect(historyReads).toBe(oldHistoryReads);
 await page.locator('[data-action="settings"]').click();await page.locator('[data-action="language"]').last().click();await page.locator('[data-action="studio"]').last().click();await page.locator('[data-action="upload"]').first().click();expect(await page.locator('html').getAttribute('dir')).toBe('rtl');expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.locator('.publish-header [data-action="close"]').click();await page.locator('.mobile-nav [data-page="account"]').click();await page.locator('[data-action="settings"]').click();await page.locator('[data-action="language"]').last().click();
 await page.locator('[data-action="logout-confirm"]').click();await page.locator('[data-action="logout"]').click();
 await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:5199/');await page.locator('.large-card').first().waitFor();
 expect(await page.locator('.mobile-nav .nav-item').count()).toBe(5);expect(await page.locator('.category-tabs').count()).toBe(0);
 const screenshot=async name=>{if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.filter(i=>i.getBoundingClientRect().top<innerHeight).map(i=>Promise.race([i.decode().catch(()=>{}),new Promise(r=>setTimeout(r,2000))]))));await page.screenshot({path:process.env.SCREENSHOT_DIR+'/'+name+'.png',animations:'disabled'});}};
 console.log('CHECK mobile discover');await screenshot('discover');
 await page.locator('.mobile-nav [data-page="browse"]').click();await screenshot('browse');
 await page.locator('.mod-card [data-mod]').first().click();await screenshot('detail');
 await page.locator('.mobile-nav [data-page="favorites"]').click();await screenshot('favorites');
 await page.locator('.mobile-nav [data-page="account"]').click();await screenshot('account');
 await page.locator('[data-action="settings"]').click();await expect(page.locator('.modal')).toContainText('Supabase');await page.locator('[data-action="language"]').last().click();
 expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
 for(const target of ['discover','browse','favorites','downloads','account']){await page.locator('.mobile-nav [data-page="'+target+'"]').click();expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(await page.locator('.mobile-nav .active').count()).toBe(1);}
 await page.locator('.mobile-nav [data-page="browse"]').click();await screenshot('arabic-browse');
 await page.setViewportSize({width:1440,height:1080});await page.locator('.sidebar button[data-page="discover"]').click();await screenshot('desktop');console.log('CHECK desktop');
 console.log('CHECK legacy flows complete');if(process.env.LEGACY_SCHEMA!=='1'){
  // Extend the mocked catalog with legitimate metadata-only records, never live writes.
  for(let i=0;i<2;i++)mods.push({id:'30000000-0000-4000-8000-00000000000'+i,title:'Creator shader '+i,description:'A creator-owned Bedrock shader with original source attribution.',category:'Shaders',minecraft_version:'1.21',editor_rating:null,source_type:'external',source:'creator-feed',source_url:'https://creator.example.com/pack/'+i,author:'Fixture creator',thumbnail:'https://vvypjqmskdtajkeogzmu.supabase.co/storage/v1/object/public/craftly-covers/sample1/cover.webp',screenshots:['https://vvypjqmskdtajkeogzmu.supabase.co/storage/v1/object/public/craftly-covers/sample0/cover.webp'],usage_information:'Metadata display/cache permission; files remain with creator.',file_size:123456,created_at:new Date(Date.now()-86400000).toISOString(),updated_at:new Date(Date.now()+i).toISOString()});
  await page.reload();await page.locator('.hero-carousel').waitFor();await expect(page.locator('[data-slide]')).toHaveCount(5);await expect(page.locator('.hero-slide:not([inert])').first()).toContainText('Creator shader 1');
  await page.locator('[data-slide="2"]').click();await expect(page.locator('[data-slide="2"]')).toHaveAttribute('aria-current','true');
  await page.locator('[data-slide="0"]').click();await expect(page.locator('[data-slide="0"]')).toHaveAttribute('aria-current','true');
  await page.locator('.hero-slide:not([inert]) [data-mod]').first().click();await expect(page.locator('.source-attribution')).toContainText('Fixture creator');await page.locator('[data-tab="pictures"]').click();await expect(page.locator('.gallery-image')).toHaveCount(2);await page.locator('[data-download]').click();await expect(page.locator('.modal')).toContainText('creator.example.com');await expect(page.locator('[data-open-external]')).toHaveAttribute('data-open-external','https://creator.example.com/pack/1');await page.locator('[data-action="close"]').click();
  await page.setViewportSize({width:390,height:844});await page.locator('.mobile-nav [data-page="discover"]').click();await screenshot('hybrid-carousel');
  await page.locator('.mobile-nav [data-page="browse"]').click();await page.locator('.search-filter').click();await page.selectOption('select[name="source"]','creator-feed');await page.locator('#filters-form [type="submit"]').click();await expect(page.locator('.mod-card')).toHaveCount(2);expect(catalogReads).toBe(0);
  await page.locator('.mobile-nav [data-page="account"]').click();await page.locator('[data-action="login"]').click();await page.locator('[name="email"]').fill('fixture@example.test');await page.locator('[name="password"]').fill('test-fixture-password');await page.locator('#auth-form [type="submit"]').click();await expect(page.locator('.account-card')).toContainText('Cloud Explorer');await page.locator('[data-action="studio"]').last().click();await page.locator('[data-action="upload"]').first().click();
  await page.locator('[name="title"]').fill('Manual link pack');await page.locator('textarea[name="description"]').fill('An original manual listing with creator screenshots.');await page.locator('[name="image"]').setInputFiles('public/images/cottage.webp');await page.locator('.manual-extra summary').click();await page.locator('[name="author"]').fill('Test Writer');await page.locator('[name="tags"]').fill('survival, original');await page.locator('[name="downloadUrl"]').fill('https://creator.example.com/manual');await expect(page.locator('#publish-package')).toHaveJSProperty('required',false);await page.locator('[name="screenshots"]').setInputFiles('public/images/cottage.webp');await page.locator('#upload-form [type="submit"]').click();await expect(page.locator('.studio-mod-name').filter({hasText:'Manual link pack'})).toBeVisible({timeout:20000});
  const manual=mods.find(m=>m.title==='Manual link pack');expect(manual.source_type).toBe('manual');expect(manual.package_path).toBe(null);expect(manual.screenshots.length).toBe(1);expect(manual.author).toBe('Test Writer');expect(manual.tags).toEqual(['survival','original']);await page.locator('.studio-mod-name').filter({hasText:'Manual link pack'}).click();await expect(page.locator('[data-download]')).toContainText('المصدر');await page.locator('[data-tab="pictures"]').click();await expect(page.locator('.gallery-image')).toHaveCount(2);

 }
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS hybrid paging/source filter, latest-five carousel, external attribution/screenshots/source handoff, source permission gating; splash, welcome, restored login, cached navigation, Studio sorting/category/layout, cover preview, enabled declaration, staged upload failure/cleanup/retry; redesigned mobile/desktop UI: admin sign-in, upload, favorites, rating, signed download, history, session restore, deletion, logout, email confirmation, mobile and RTL.');
}finally{await browser?.close();server.kill();}
