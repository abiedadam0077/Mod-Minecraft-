import {createClient} from '@supabase/supabase-js';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './cloud-config.js';
export const cloud=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
 auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'craftly-supabase-v1'}
});
const fail=result=>{if(result.error)throw Error(result.error.message);return result.data;};
export async function currentUser(){
 const {data,error}=await cloud.auth.getSession();if(error)throw error;
 if(!data.session)return null;
 const id=data.session.user.id;
 const profile=fail(await cloud.from('craftly_profiles').select('id,display_name,role').eq('id',id).single());
 const favorites=fail(await cloud.from('craftly_favorites').select('mod_id').eq('user_id',id));
 return {id,name:profile.display_name,email:data.session.user.email,role:profile.role,favorites:favorites.map(f=>f.mod_id)};
}
async function requireUser(admin=false){const u=await currentUser();if(!u)throw Error('Please sign in / سجل الدخول أولاً');if(admin&&u.role!=='admin')throw Error('Administrator access required / خاص صلاحيات الأدمن');return u;}
export function normalizeMod(m,stats={}){return {id:m.id,title:m.title,description:m.description,category:m.category,version:m.minecraft_version,editorRating:Number(m.editor_rating),rating:Number(stats.rating??m.editor_rating),ratingCount:Number(stats.rating_count||0),downloads:Number(stats.download_requests||0),size:Number(m.file_size),createdAt:m.created_at,preview:false,image:cloud.storage.from('craftly-covers').getPublicUrl(m.cover_path).data.publicUrl};}
async function catalog(){
 const [rows,stats]=await Promise.all([cloud.from('craftly_mods').select('*').order('created_at',{ascending:false}).limit(1000),cloud.rpc('craftly_mod_stats')]);
 const map=new Map((fail(stats)||[]).map(s=>[s.mod_id,s]));return (fail(rows)||[]).map(m=>normalizeMod(m,map.get(m.id)));
}
export async function validateUpload(form){
 const title=String(form.get('title')||'').trim(),description=String(form.get('description')||'').trim(),category=form.get('category'),version=form.get('version'),rating=Number(form.get('editorRating'));
 if(title.length<3||title.length>80||description.length<15||description.length>5000)throw Error('Check the title and description lengths.');
 if(!['Add-ons','Textures','Worlds','Skins'].includes(category)||!/^\d+\.\d+(\.\d+)?$/.test(version)||!Number.isFinite(rating)||rating<1||rating>5)throw Error('Check category, version and rating.');
 const image=form.get('image'),file=form.get('file');
 if(!image?.size||image.size>8*1048576)throw Error('Cover must be under 8 MB / الصورة أقل من 8 MB');
 if(!file?.size||file.size>50*1048576)throw Error('Package must be under 50 MB / الملف أقل من 50 MB');
 const ie=image.name.split('.').at(-1).toLowerCase(),ext=file.name.split('.').at(-1).toLowerCase();
 if(!['png','jpg','jpeg','webp'].includes(ie)||!['mcaddon','mcpack','mcworld'].includes(ext))throw Error('Unsupported image or Bedrock package.');
 const b=new Uint8Array(await image.slice(0,12).arrayBuffer());
 const ascii=(a,z)=>String.fromCharCode(...b.slice(a,z));
 const mime=ie==='png'&&b[0]===137&&ascii(1,4)==='PNG'?'image/png':['jpg','jpeg'].includes(ie)&&b[0]===255&&b[1]===216?'image/jpeg':ie==='webp'&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'?'image/webp':null;
 const head=new Uint8Array(await file.slice(0,4).arrayBuffer());
 if(!mime||head[0]!==80||head[1]!==75)throw Error('Invalid image or ZIP-based Minecraft package.');
 return {title,description,category,minecraft_version:version,editor_rating:rating,image,file,ie,ext,mime};
}
async function publish(form){
 const u=await requireUser(true),v=await validateUpload(form),id=crypto.randomUUID();
 const cover=`${id}/cover.${v.ie}`,pack=`${id}/package.${v.ext}`;
 let coverDone=false,packDone=false;
 try{
  fail(await cloud.storage.from('craftly-covers').upload(cover,v.image,{contentType:v.mime,upsert:false}));coverDone=true;
  fail(await cloud.storage.from('craftly-packages').upload(pack,v.file,{contentType:'application/octet-stream',upsert:false}));packDone=true;
  const row=fail(await cloud.from('craftly_mods').insert({id,title:v.title,description:v.description,category:v.category,minecraft_version:v.minecraft_version,editor_rating:v.editor_rating,cover_path:cover,package_path:pack,file_size:v.file.size,created_by:u.id,published:true}).select().single());
  return normalizeMod(row);
 }catch(error){
  // Compensate failed multi-service uploads. A network outage may prevent cleanup;
  // keep the UUID in the error so the owner can remove orphan files later.
  const cleanup=await Promise.all([coverDone?cloud.storage.from('craftly-covers').remove([cover]):null,packDone?cloud.storage.from('craftly-packages').remove([pack]):null]);
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
 if(path==='/me')return currentUser();
 if(path==='/mods')return catalog();
 if(path==='/downloads'){
  const u=await requireUser();
  const rows=fail(await cloud.from('craftly_downloads').select('mod_id,requested_at,craftly_mods(id,title,cover_path)').eq('user_id',u.id).order('requested_at',{ascending:false}).limit(1000));
  return rows.filter(r=>r.craftly_mods).map(r=>({id:r.mod_id,modId:r.mod_id,title:r.craftly_mods.title,image:cloud.storage.from('craftly-covers').getPublicUrl(r.craftly_mods.cover_path).data.publicUrl,date:r.requested_at}));
 }
 if(path==='/admin/mods'&&method==='POST')return publish(body);
 const remove=path.match(/^\/admin\/mods\/([\w-]+)$/);
 if(remove&&method==='DELETE'){
  await requireUser(true);const id=remove[1];
  const row=fail(await cloud.from('craftly_mods').select('cover_path,package_path').eq('id',id).single());
  // Remove catalog access first. Never directly delete rows from storage.objects.
  fail(await cloud.from('craftly_mods').delete().eq('id',id));
  const results=await Promise.all([cloud.storage.from('craftly-covers').remove([row.cover_path]),cloud.storage.from('craftly-packages').remove([row.package_path])]);
  return {ok:true,warning:results.some(r=>r.error)?`Mod removed. Storage cleanup pending for ${id}. / المود تحذف؛ تنظيف الملفات باقي.`:null};
 }
 const fav=path.match(/^\/favorites\/([\w-]+)$/);
 if(fav){const u=await requireUser(),id=fav[1];
  fail(u.favorites.includes(id)?await cloud.from('craftly_favorites').delete().eq('user_id',u.id).eq('mod_id',id):await cloud.from('craftly_favorites').insert({user_id:u.id,mod_id:id}));
  return (await currentUser()).favorites;
 }
 const rate=path.match(/^\/mods\/([\w-]+)\/rating$/);
 if(rate){const u=await requireUser();if(!Number.isInteger(body.rating)||body.rating<1||body.rating>5)throw Error('Choose 1–5 stars.');fail(await cloud.from('craftly_ratings').upsert({user_id:u.id,mod_id:rate[1],rating:body.rating},{onConflict:'user_id,mod_id'}));return {};}
 const download=path.match(/^\/mods\/([\w-]+)\/download$/);
 if(download){await requireUser();const m=fail(await cloud.from('craftly_mods').select('id,title,package_path,published').eq('id',download[1]).eq('published',true).single());
  const ext=m.package_path.split('.').at(-1),filename=(m.title.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,65)||'Craftly')+'_'+m.id.slice(0,8)+'.'+ext;
  const signed=fail(await cloud.storage.from('craftly-packages').createSignedUrl(m.package_path,600,{download:filename}));
  fail(await cloud.rpc('craftly_record_download',{p_mod_id:m.id}));
  return {url:signed.signedUrl,filename};
 }
 throw Error('Unsupported cloud operation');
}
