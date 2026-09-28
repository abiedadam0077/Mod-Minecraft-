declare const EdgeRuntime: {waitUntil(task:Promise<unknown>):void};
import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {sourceConfiguration,fetchPage,normalizeItem} from '../_shared/providers.js';
const env=(key:string)=>Deno.env.get(key)||'';
const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-cron-secret','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const checked=(r:any)=>{if(r.error)throw Error('Database operation failed: '+r.error.code);return r.data;};
async function syncOne(id:string){
 const claimed=checked(await db.rpc('craftly_claim_source',{p_source:id}));if(!claimed?.length)return {skipped:true};const source=claimed[0];
 let fresh=0,updated=0,failed=0;
 try{
  let config;try{config=sourceConfiguration(id,env);}catch(e){
   checked(await db.from('craftly_sources').update({enabled:false,status:'Disabled',lease_until:null,error:e instanceof Error?e.message:'Permission configuration missing'}).eq('id',id));
   checked(await db.from('craftly_mods').delete().eq('source_type','external').eq('source',id));return {disabled:true};
  }
  // Alternate a latest page with a bounded rotating backfill; never download mod files.
  const cursor=source.run_number%2?0:source.cursor_index;
  const page=await fetchPage(id,cursor,config);
  const blocks=checked(await db.from('craftly_external_blocks').select('external_id').eq('source',id));const blocked=new Set(blocks.map((b:any)=>b.external_id));
  for(const item of page.items){
   try{
    const row=normalizeItem(item,id,config);if(!row||blocked.has(row.external_id))continue;
    // Disabling a source while a request is in flight must not republish it.
    const current=checked(await db.from('craftly_sources').select('enabled').eq('id',id).single());if(!current.enabled)break;
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({...row,checked_at:undefined,expires_at:undefined})));
    const metadata_hash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
    const existing=checked(await db.from('craftly_mods').select('id,metadata_hash').eq('source',id).eq('external_id',row.external_id).maybeSingle());
    const duplicate=checked(await db.from('craftly_mods').select('id,source,external_id').eq('source_url',row.source_url).maybeSingle());
    if(duplicate&&duplicate.id!==existing?.id)continue;
    checked(await db.from('craftly_mods').upsert({...row,metadata_hash},{onConflict:'source,external_id'}));if(!existing)fresh++;else if(existing.metadata_hash!==metadata_hash)updated++;
   }catch{failed++;}
  }
  const total=await db.from('craftly_mods').select('id',{count:'exact',head:true}).eq('source',id);
  checked(await db.from('craftly_sources').update({status:failed?'Error':'Connected',last_sync:new Date().toISOString(),lease_until:null,new_items:fresh,updated_items:updated,failed_items:failed,imported_items:total.count||0,cursor_index:source.run_number%2?source.cursor_index:page.next,error:failed?'Some records failed validation; no files were imported.':null}).eq('id',id).eq('enabled',true));
  return {new:fresh,updated,failed};
 }catch(e){
  const message=e instanceof Error?e.message:'Sync failed';const retryAfterMs=Number((e as {retryAfterMs?:number})?.retryAfterMs)||900000;const nextSync=new Date(Math.min(8640000000000000,Date.now()+Math.max(900000,retryAfterMs))).toISOString();
  checked(await db.from('craftly_sources').update({status:'Error',next_sync:nextSync,error:message.slice(0,250),failed_items:failed+1,new_items:fresh,updated_items:updated,lease_until:null}).eq('id',id).eq('enabled',true));return {error:message};
 }
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return response({error:'POST required'},405);
 try{
  if(Number(req.headers.get('content-length'))>4096)return response({error:'Request too large'},413);
  const raw=await req.text();if(raw.length>4096)return response({error:'Request too large'},413);const body=JSON.parse(raw);
  if(body.action==='tick'){
   if(!env('CRAFTLY_CRON_SECRET')||req.headers.get('x-cron-secret')!==env('CRAFTLY_CRON_SECRET'))return response({error:'Unauthorized'},401);
   checked(await db.from('craftly_mods').delete().eq('source_type','external').lt('expires_at',new Date().toISOString()));
   const sources=checked(await db.from('craftly_sources').select('id').eq('enabled',true));
   const results=await Promise.allSettled(sources.map((s:any)=>syncOne(s.id)));return response({results});
  }
  const token=req.headers.get('authorization')?.replace(/^Bearer /i,'');if(!token)return response({error:'Sign in required'},401);
  const {data,error}=await db.auth.getUser(token);if(error||!data.user)return response({error:'Invalid session'},401);
  const profile=checked(await db.from('craftly_profiles').select('role').eq('id',data.user.id).single());if(profile.role!=='admin')return response({error:'Administrator required'},403);
  if(body.action==='status')return response(checked(await db.from('craftly_sources').select('*').order('id')));
  if(!['curseforge','creator-feed'].includes(body.source))return response({error:'Unknown source'},400);
  if(body.action==='toggle'){
   if(typeof body.enabled!=='boolean')return response({error:'Boolean enabled required'},400);
   if(body.enabled)sourceConfiguration(body.source,env);
   checked(await db.from('craftly_sources').update({enabled:body.enabled,status:body.enabled?'Pending':'Disabled',error:null}).eq('id',body.source));
   if(!body.enabled)checked(await db.from('craftly_mods').delete().eq('source_type','external').eq('source',body.source));
   return response({ok:true});
  }
  if(body.action==='sync'){
   sourceConfiguration(body.source,env);
   const source=checked(await db.from('craftly_sources').select('*').eq('id',body.source).single());
   if(!source.enabled)return response({error:'Enable the approved source first'},409);
   if(Date.parse(source.next_sync)>Date.now())return response({error:'Rate limit: next allowed sync '+source.next_sync},429);
   EdgeRuntime.waitUntil(syncOne(body.source));return response({queued:true},202);
  }
  return response({error:'Unknown action'},400);
 }catch(e){return response({error:e instanceof Error?e.message:'Request failed'},400);}
});
