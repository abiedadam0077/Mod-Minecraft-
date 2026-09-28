export const CATEGORIES=['Add-ons','Textures','Worlds','Skins','Mods','Shaders','Maps','Scripts'];
export function categoryMapping(names=[]){const values=names.map(n=>String(n).toLowerCase().replace(/[_-]/g,' '));for(const [category,terms] of [['Shaders',['shader']],['Skins',['skin']],['Scripts',['script']],['Maps',['map']],['Worlds',['world']],['Textures',['texture','resource pack']],['Mods',['mod']],['Add-ons',['addon','add on','behavior pack','behaviour pack']]])if(values.some(v=>terms.some(term=>v===term||v===term+'s')))return category;return 'Add-ons';}
export function safeURL(value,hosts){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!u.hostname.includes('.')||/^[\d.]+$|:|(^|\.)(localhost|local|internal|test)$/i.test(u.hostname))return null;if(hosts&&!hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))return null;u.hash='';return u.href;}catch{return null;}}
const text=(s,max)=>String(s||'').replace(/<[^>]*>/g,'').trim().slice(0,max);
const iso=v=>Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
export function normalizeItem(item,source,{artwork=false,ttlHours=24,now=Date.now()}={}){
 const cf=source==='curseforge',link=safeURL(cf?item.links?.websiteUrl:item.source_url,cf?['curseforge.com']:undefined),id=String(cf?item.id:item.external_id||'');
 if(!id||id.length>180||!link)throw Error('Missing stable ID or safe source URL');
 if(cf&&(!item.isAvailable||item.status!==4))return null;
 if(!cf&&(item.edition!=='bedrock'||!item.usage?.metadata_display||!item.usage?.metadata_cache||!text(item.license,500)))throw Error('Bedrock and explicit metadata/cache permission required');
 const file=cf?item.latestFiles?.find(f=>/\.(mcpack|mcaddon|mcworld)$/i.test(f.fileName||'')):null;
 const versions=(cf?(file?.gameVersions||item.latestFilesIndexes?.map(f=>f.gameVersion)||[]):item.minecraft_versions||[]).filter(v=>/^\d+\.\d+(\.\d+)?$/.test(v)).slice(0,30);
 const assets=cf?['forgecdn.net']:undefined;
 const thumbnail=artwork&&(cf||item.usage?.images)?safeURL(cf?item.logo?.thumbnailUrl:item.thumbnail,assets):null;
 const screenshots=artwork&&(cf||item.usage?.images)?(item.screenshots||[]).slice(0,6).map(s=>safeURL(cf?(s.thumbnailUrl||s.url):s,assets)).filter(Boolean):[];
 const published=iso(cf?(item.dateReleased||item.dateCreated):item.published_at),updated=iso(cf?item.dateModified:item.updated_at)||published;
 if(!published||!updated||Date.parse(updated)>now+86400000)throw Error('Valid publication/update dates required');
 const title=text(cf?item.name:item.title,80),description=text(cf?item.summary:item.description,5000);if(title.length<3)throw Error('Title too short');
 const category=categoryMapping(cf?item.categories?.map(c=>c.name):[item.category]);
 const downloads=cf?item.downloadCount:item.downloads;
 return {title,description,category,minecraft_version:versions[0]||'Unknown',minecraft_versions:versions,author:text(cf?item.authors?.map(a=>a.name).join(', '):item.author,200),thumbnail,screenshots,tags:cf?[]:(item.tags||[]).slice(0,20).map(s=>text(s,40)),source_type:'external',source,source_url:link,external_id:id,download_url:null,cover_path:null,package_path:null,file_type:cf?file?.fileName?.split('.').pop()||null:text(item.file_type,20)||null,file_size:cf?file?.fileLength||null:(Number.isFinite(item.file_size)&&item.file_size>0?item.file_size:null),editor_rating:null,source_rating:(!cf&&typeof item.rating==='number'&&item.rating>=1&&item.rating<=5)?item.rating:null,source_downloads:Number.isFinite(downloads)&&downloads>=0?Math.floor(downloads):null,usage_information:cf?'Metadata only under separately approved caching permission. Copyright remains with the author. Files are not mirrored.':text(item.license,1000),created_at:published,updated_at:updated,checked_at:new Date(now).toISOString(),expires_at:new Date(now+ttlHours*3600000).toISOString(),published:true};
}
export async function requestJSON(url,{headers={},fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 for(let attempt=0;attempt<3;attempt++){
  let response;try{response=await fetcher(url,{headers,redirect:'error',signal:AbortSignal.timeout(12000)});}catch{if(attempt===2)throw Error('Source connection timed out');await sleep(500*2**attempt);continue;}
  if(response.ok){const reader=response.body.getReader();let length=0;const chunks=[];while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>2*1024*1024){await reader.cancel();throw Error('Source response exceeds 2 MB');}chunks.push(value);}const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));}
  if(response.status!==429&&response.status<500)throw Error('Source rejected request: HTTP '+response.status);
  const retry=response.headers.get('retry-after'),wait=retry?(/^\d+$/.test(retry)?Number(retry)*1000:Math.max(0,Date.parse(retry)-Date.now())):500*2**attempt;
  if(attempt===2||wait>3000){const error=Object.assign(Error('Source rate limited/unavailable; retry on a later sync'),{retryAfterMs:Number.isFinite(wait)?Math.max(0,wait):900000});throw error;}await sleep(Math.max(500,wait||500));
 }
}
export function sourceConfiguration(source,env){
 const ttl=Number(env('SOURCE_CACHE_HOURS'));if(!(ttl>0&&ttl<=168))throw Error('Set approved SOURCE_CACHE_HOURS (0–168)');
 if(source==='curseforge'){
  if(!env('CURSEFORGE_API_KEY')||!env('CURSEFORGE_CACHE_PERMISSION_REFERENCE'))throw Error('Disabled: API approval AND written exception permitting metadata caching required');
  const gameId=Number(env('CURSEFORGE_BEDROCK_GAME_ID'));if(!Number.isSafeInteger(gameId)||gameId<=0)throw Error('Verified Bedrock game ID required');
  return {ttlHours:ttl,gameId,artwork:env('CURSEFORGE_ARTWORK_ALLOWED')==='true',headers:{'x-api-key':env('CURSEFORGE_API_KEY'),'Accept':'application/json'}};
 }
 if(source==='creator-feed'){
  const url=safeURL(env('APPROVED_FEED_URL'));if(!url||!env('APPROVED_FEED_PERMISSION_REFERENCE'))throw Error('Disabled: approved HTTPS creator feed and permission reference required');
  return {ttlHours:ttl,url,artwork:env('APPROVED_FEED_ARTWORK_ALLOWED')==='true',headers:env('APPROVED_FEED_TOKEN')?{Authorization:'Bearer '+env('APPROVED_FEED_TOKEN')}: {}};
 }
 throw Error('Unknown source');
}
export async function fetchPage(source,cursor,config,request=requestJSON){
 if(source==='curseforge'){
  const game=await request('https://api.curseforge.com/v1/games/'+config.gameId,config);if(!/bedrock/i.test([game.data?.name,game.data?.slug].join(' ')))throw Error('Refusing non-Bedrock game');
  const url=new URL('https://api.curseforge.com/v1/mods/search');for(const [k,v] of Object.entries({gameId:config.gameId,index:cursor,pageSize:25,sortField:3,sortOrder:'desc'}))url.searchParams.set(k,String(v));
  const r=await request(url.href,config);if(!Array.isArray(r.data)||r.data.length>25)throw Error('Invalid bounded API response');return {items:r.data,next:r.data.length===25&&cursor<975?cursor+20:0};
 }
 const url=new URL(config.url);url.searchParams.set('offset',String(cursor));url.searchParams.set('limit','25');const r=await request(url.href,config);
 if(!Array.isArray(r.items)||r.items.length>25)throw Error('Feed must return at most 25 items');return {items:r.items,next:r.has_more===true&&cursor<975?cursor+25:0};
}
