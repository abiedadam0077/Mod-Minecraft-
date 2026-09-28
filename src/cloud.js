import {optimizeArtwork} from './media.js';
import {HUB_CATEGORIES,externalURL} from './hub.js';
import {createQueryCache} from './cache.js';
import {createClient} from '@supabase/supabase-js';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './cloud-config.js';
export const cloud=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
 auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'craftly-supabase-v1'}
});
const queries=createQueryCache();
export function invalidateCloudCache(){queries.invalidate();}
cloud.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN'||event==='USER_UPDATED')queries.invalidate();});
const fail=result=>{if(result.error)throw Error(result.error.message);return result.data;};
export async function currentUser({force=false}={}){
 const {data,error}=await cloud.auth.getSession();if(error)throw error;
 if(!data.session)return null;
 const id=data.session.user.id;
 const [profile,favorites]=await Promise.all([
  queries.read('profile:'+id,async()=>fail(await cloud.from('craftly_profiles').select('id,display_name,role').eq('id',id).single()),{ttl:60000,force}),
  queries.read('favorites:'+id,async()=>fail(await cloud.from('craftly_favorites').select('mod_id').eq('user_id',id)),{ttl:30000,force})
 ]);
 return {id,name:profile.display_name,email:data.session.user.email,role:profile.role,favorites:favorites.map(f=>f.mod_id)};
}
async function requireUser(admin=false){const u=await currentUser({force:admin});if(!u)throw Error('Please sign in / سجل الدخول أولاً');if(admin&&u.role!=='admin')throw Error('Administrator access required / خاص صلاحيات الأدمن');return u;}
export let hubAvailable=null;
export function normalizeMod(m,stats={}){const rating=stats.rating??m.rating??m.source_rating??m.editor_rating;return {id:m.id,title:m.title,description:m.description,category:m.category,version:m.minecraft_version,versions:m.minecraft_versions||[],editorRating:m.editor_rating==null?null:Number(m.editor_rating),rating:rating==null?null:Number(rating),ratingCount:Number(stats.rating_count??m.rating_count??0),downloads:m.source_type==='external'&&m.source_downloads==null?null:Number(m.source_downloads??stats.download_requests??m.download_requests??0),size:Number(m.file_size||0),createdAt:m.created_at,updatedAt:m.updated_at||m.created_at,preview:false,image:m.thumbnail||(m.cover_path?cloud.storage.from('craftly-covers').getPublicUrl(m.cover_path).data.publicUrl:'images/overworld.webp'),screenshots:m.screenshots||[],author:m.author||'',tags:m.tags||[],sourceType:m.source_type||'manual',source:m.source||'manual',sourceUrl:externalURL(m.source_url),downloadUrl:externalURL(m.download_url),license:m.usage_information||'',fileType:m.file_type||null,hasPackage:!!m.package_path};}
async function legacyCatalog(){const [rows,stats]=await Promise.all([cloud.from('craftly_mods').select('*').order('created_at',{ascending:false}).limit(1000),cloud.rpc('craftly_mod_stats')]);const map=new Map((fail(stats)||[]).map(s=>[s.mod_id,s]));return (fail(rows)||[]).map(m=>normalizeMod(m,map.get(m.id)));}
export async function catalogPage(options={}){
 const {category='All mods',version='all',source='all',search='',sort='new',rating=0,offset=0,limit=24,ids=null,force=false}=options;
 const key='catalog:'+JSON.stringify({category,version,source,search,sort,rating,offset,limit,ids});
 return queries.read(key,async()=>{
  if(hubAvailable!==false){const result=await cloud.rpc('craftly_catalog_page',{p_category:category,p_version:version,p_source:source,p_search:search,p_sort:sort,p_rating:rating,p_offset:offset,p_limit:limit,p_ids:ids});if(!result.error){hubAvailable=true;return {items:result.data.items.map(m=>normalizeMod(m)),hasMore:result.data.hasMore};}if(!['PGRST202','42883'].includes(result.error.code))throw Error(result.error.message);hubAvailable=false;}
  const all=await queries.read('legacy-catalog',legacyCatalog,{ttl:60000,force});let rows=all.filter(m=>(category==='All mods'||m.category===category||category==='Maps / Worlds'&&['Maps','Worlds'].includes(m.category))&&(version==='all'||m.version===version||m.version.startsWith(version+'.'))&&(source==='all'||m.source===source)&&(!ids||ids.includes(m.id))&&(!rating||m.rating>=rating)&&(`${m.title} ${m.description} ${m.author}`.toLowerCase().includes(search.toLowerCase())));
  rows.sort(sort==='downloads'?(a,b)=>b.downloads-a.downloads:sort==='rating'?(a,b)=>(b.rating??-1)-(a.rating??-1):(a,b)=>new Date(sort==='updated'?b.updatedAt:b.createdAt)-new Date(sort==='updated'?a.updatedAt:a.createdAt));return {items:rows.slice(offset,offset+limit),hasMore:rows.length>offset+limit};
 },{ttl:60000,force});
}
async function catalog(){return (await catalogPage({limit:48})).items;}
export async function validateUpload(form){
 const title=String(form.get('title')||'').trim(),description=String(form.get('description')||'').trim(),category=form.get('category'),version=form.get('version'),rating=Number(form.get('editorRating'));
 if(title.length<3||title.length>80||description.length<15||description.length>5000)throw Error('Check the title and description lengths.');
 if(!HUB_CATEGORIES.slice(1).some(([c])=>c===category)||!/^\d+\.\d+(\.\d+)?$/.test(version)||!Number.isFinite(rating)||rating<1||rating>5)throw Error('Check category, version and rating.');
 const image=form.get('image'),file=form.get('file'),downloadUrl=externalURL(form.get('downloadUrl'));const linkOnly=!file?.size&&!!downloadUrl;if(form.get('downloadUrl')&&!downloadUrl)throw Error('A public HTTPS source URL is required.');
 if(!image?.size||image.size>8*1048576)throw Error('Cover must be under 8 MB / الصورة أقل من 8 MB');
 if(!linkOnly&&(!file?.size||file.size>50*1048576))throw Error('Package must be under 50 MB / الملف أقل من 50 MB');
 const ie=image.name.split('.').at(-1).toLowerCase(),ext=linkOnly?'mcpack':file.name.split('.').at(-1).toLowerCase();
 if(!['png','jpg','jpeg','webp'].includes(ie)||!['mcaddon','mcpack','mcworld'].includes(ext))throw Error('Unsupported image or Bedrock package.');
 const b=new Uint8Array(await image.slice(0,12).arrayBuffer());
 const ascii=(a,z)=>String.fromCharCode(...b.slice(a,z));
 const mime=ie==='png'&&b[0]===137&&ascii(1,4)==='PNG'?'image/png':['jpg','jpeg'].includes(ie)&&b[0]===255&&b[1]===216?'image/jpeg':ie==='webp'&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'?'image/webp':null;
 const head=linkOnly?new Uint8Array([80,75]):new Uint8Array(await file.slice(0,4).arrayBuffer());
 if(!mime||head[0]!==80||head[1]!==75)throw Error('Invalid image or ZIP-based Minecraft package.');
 const screenshots=form.getAll('screenshots').filter(f=>f?.size);if(screenshots.length>6)throw Error('Up to 6 screenshots allowed.');for(const shot of screenshots){if(shot.size>8*1048576||!['image/png','image/jpeg','image/webp'].includes(shot.type))throw Error('Screenshots must be PNG/JPG/WebP under 8 MB.');}
 return {title,description,category,minecraft_version:version,editor_rating:rating,image,file,ie,ext,mime,downloadUrl,linkOnly,screenshots,author:String(form.get('author')||'').trim().slice(0,200),tags:String(form.get('tags')||'').split(',').map(s=>s.trim().slice(0,40)).filter(Boolean).slice(0,20)};
}
async function publish(form,onProgress=()=>{}){
 onProgress({stage:"validating"});
 const u=await requireUser(true),v=await validateUpload(form),id=crypto.randomUUID();
 if(hubAvailable===null)await catalogPage({limit:1});if(hubAvailable===false&&(v.downloadUrl||v.linkOnly||v.screenshots.length||v.author||v.tags.length||!['Add-ons','Textures','Worlds','Skins'].includes(v.category)))throw Error('Apply the Content Hub database migration to use the extended fields. Original file uploads remain available.');
 v.image=await optimizeArtwork(v.image);if(v.image.type==='image/webp'){v.ie='webp';v.mime='image/webp';}
 const cover=`${id}/cover.${v.ie}`,pack=`${id}/package.${v.ext}`,screenPaths=[];
 let coverDone=false,packDone=false;
 try{
  onProgress({stage:'cover',file:v.image.name,size:v.image.size});
  fail(await cloud.storage.from('craftly-covers').upload(cover,v.image,{contentType:v.mime,cacheControl:'86400',upsert:false}));coverDone=true;
  for(let i=0;i<v.screenshots.length;i++){const shot=await optimizeArtwork(v.screenshots[i],1600),path=`${id}/screen_${i}.${shot.type==='image/png'?'png':shot.type==='image/jpeg'?'jpg':'webp'}`;fail(await cloud.storage.from('craftly-covers').upload(path,shot,{contentType:shot.type,cacheControl:'86400'}));screenPaths.push(path);}
  if(!v.linkOnly){onProgress({stage:'package',file:v.file.name,size:v.file.size});
  fail(await cloud.storage.from('craftly-packages').upload(pack,v.file,{contentType:'application/octet-stream',upsert:false}));packDone=true;}
  onProgress({stage:'publishing'});
  const row=fail(await cloud.from('craftly_mods').insert({id,title:v.title,description:v.description,category:v.category,minecraft_version:v.minecraft_version,editor_rating:v.editor_rating,cover_path:cover,package_path:v.linkOnly?null:pack,file_size:v.linkOnly?null:v.file.size,created_by:u.id,published:true,...(hubAvailable?{source_type:'manual',source:'manual',author:v.author,tags:v.tags,download_url:v.downloadUrl,updated_at:new Date().toISOString(),screenshot_paths:screenPaths,screenshots:screenPaths.map(p=>cloud.storage.from('craftly-covers').getPublicUrl(p).data.publicUrl)}:{})}).select().single());
  queries.invalidate();onProgress({stage:'complete'});return normalizeMod(row);
 }catch(error){
  onProgress({stage:'cleanup'});
  // Compensate failed multi-service uploads. A network outage may prevent cleanup;
  // keep the UUID in the error so the owner can remove orphan files later.
  const cleanup=await Promise.all([coverDone?cloud.storage.from('craftly-covers').remove([cover,...screenPaths]):screenPaths.length?cloud.storage.from('craftly-covers').remove(screenPaths):null,packDone?cloud.storage.from('craftly-packages').remove([pack]):null]);
  if(cleanup.some(r=>r?.error))throw Error(`${error.message} — Cleanup pending for ${id}`);
  throw error;
 }
}
export async function cloudApi(path,options={}){
 const method=options.method||'GET',body=options.body instanceof FormData?options.body:options.body?JSON.parse(options.body):{};
 if(path==='/auth/login'||path==='/auth/register'){
  const signup=path.endsWith('register');
  const result=signup?await cloud.auth.signUp({email:body.email,password:body.password,options:{data:{name:body.name}}}):await cloud.auth.signInWithPassword({email:body.email,password:body.password});
  fail(result);
  if(!result.data.session)return {confirmationRequired:true};
  return {token:'supabase-session',user:await currentUser()};
 }
 if(path==='/auth/logout'){fail(await cloud.auth.signOut({scope:'local'}));return {ok:true};}
 if(path==='/auth/resend'){fail(await cloud.auth.resend({type:'signup',email:body.email}));return {ok:true};}
 if(path==='/me')return currentUser({force:options.force});
 if(path==='/mods'){if(options.force){queries.invalidate();hubAvailable=null;}return catalog();}
 if(path==='/sources')return fail(await cloud.from('craftly_sources').select('*').order('id'));
 if(path==='/sources/action'){await requireUser(true);const {data,error}=await cloud.functions.invoke('content-hub',{body});if(error){let message=error.message;try{message=(await error.context.json()).error||message;}catch{}throw Error(message);}if(data.error)throw Error(data.error);queries.invalidate();return data;}
 if(path==='/downloads'){
  const u=await requireUser();
  return queries.read('downloads:'+u.id,async()=>{
  const rows=fail(await cloud.from('craftly_downloads').select('mod_id,requested_at,craftly_mods(id,title,cover_path)').eq('user_id',u.id).order('requested_at',{ascending:false}).limit(1000));
  return rows.filter(r=>r.craftly_mods).map(r=>({id:r.mod_id,modId:r.mod_id,title:r.craftly_mods.title,image:cloud.storage.from('craftly-covers').getPublicUrl(r.craftly_mods.cover_path).data.publicUrl,date:r.requested_at}));
  },{ttl:30000,force:options.force});
 }
 if(path==='/admin/mods'&&method==='POST')return publish(body,options.onProgress);
 const remove=path.match(/^\/admin\/mods\/([\w-]+)$/);
 if(remove&&method==='DELETE'){
  await requireUser(true);const id=remove[1];
  const row=fail(await cloud.from('craftly_mods').select('*').eq('id',id).single());
  if(row.source_type==='external'){fail(await cloud.rpc('craftly_hide_external',{p_id:id}));queries.invalidate();return {ok:true};}
  // Remove catalog access first. Never directly delete rows from storage.objects.
  fail(await cloud.from('craftly_mods').delete().eq('id',id));queries.invalidate();
  const results=await Promise.all([cloud.storage.from('craftly-covers').remove([row.cover_path,...(row.screenshot_paths||[])]),row.package_path?cloud.storage.from('craftly-packages').remove([row.package_path]):Promise.resolve({})]);
  return {ok:true,warning:results.some(r=>r.error)?`Mod removed. Storage cleanup pending for ${id}. / المود تحذف؛ تنظيف الملفات باقي.`:null};
 }
 const fav=path.match(/^\/favorites\/([\w-]+)$/);
 if(fav){const u=await requireUser(),id=fav[1];
  fail(u.favorites.includes(id)?await cloud.from('craftly_favorites').delete().eq('user_id',u.id).eq('mod_id',id):await cloud.from('craftly_favorites').insert({user_id:u.id,mod_id:id}));
  queries.invalidate('favorites:'+u.id);return (await currentUser()).favorites;
 }
 const rate=path.match(/^\/mods\/([\w-]+)\/rating$/);
 if(rate){const u=await requireUser();if(!Number.isInteger(body.rating)||body.rating<1||body.rating>5)throw Error('Choose 1–5 stars.');fail(await cloud.from('craftly_ratings').upsert({user_id:u.id,mod_id:rate[1],rating:body.rating},{onConflict:'user_id,mod_id'}));queries.invalidate();return {};}
 const download=path.match(/^\/mods\/([\w-]+)\/download$/);
 if(download){await requireUser();const m=fail(await cloud.from('craftly_mods').select('*').eq('id',download[1]).eq('published',true).single());
  if(!m.package_path||m.source_type==='external')throw Error('Open the original source to download this content.');
  const ext=m.package_path.split('.').at(-1),filename=(m.title.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,65)||'Craftly')+'_'+m.id.slice(0,8)+'.'+ext;
  const signed=fail(await cloud.storage.from('craftly-packages').createSignedUrl(m.package_path,600,{download:filename}));
  fail(await cloud.rpc('craftly_record_download',{p_mod_id:m.id}));
  queries.invalidate('downloads:');queries.invalidate('catalog:');return {url:signed.signedUrl,filename};
 }
 throw Error('Unsupported cloud operation');
}
