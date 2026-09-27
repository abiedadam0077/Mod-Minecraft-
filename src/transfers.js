// Device-local transfer state. Cloud history is NOT treated as proof of a saved file.
export function createTransfers({native, ticket, onChange, storage=globalThis.localStorage}) {
  const jobs=new Map(); let owner='guest'; const running=new Map();
  const emit=()=>{storage?.setItem('craftly-transfers-'+owner,JSON.stringify([...jobs.values()].map(({url,blob,chunks,...j})=>j)));onChange?.();};
  function setOwner(id){const next=id||'guest';if(next===owner)return;for(const j of jobs.values()){if(['running','paused','queued'].includes(j.status))cancel(j.id);if(j.blob)URL.revokeObjectURL(j.blob);}jobs.clear();owner=next;try{for(const j of JSON.parse(storage?.getItem('craftly-transfers-'+owner)||'[]')){if(['running','paused','queued','failed','interrupted'].includes(j.status)){j.status='interrupted';j.bytes=0;j.chunks=[];}if(j.status==='complete')j.available=!!native?.hasDownload?.(j.filename);jobs.set(j.id,j);}}catch{}emit();}
  async function start(mod){let j=jobs.get(mod.id);if(j&&['running','queued'].includes(j.status))return j;if(j?.blob)URL.revokeObjectURL(j.blob);
    j={id:mod.id,title:mod.title,image:mod.image,total:mod.size||0,bytes:0,speed:0,status:'queued',available:false,createdAt:new Date().toISOString(),chunks:[]};jobs.set(j.id,j);emit();await run(j);return j;
  }
  async function run(j){const context=owner,revision=(j.rev||0)+1;j.rev=revision;let controller;j.status='queued';emit();try{const link=await ticket(j.id);if(context!==owner||revision!==j.rev||j.status==='canceled')return;j.filename=link.filename;j.url=link.url;j.status='running';emit();
    if(native?.startDownload){native.startDownload(j.id,link.url,j.filename,j.bytes>0);return;}
    controller=new AbortController();running.set(j.id,controller);const offset=j.bytes;
    const response=await fetch(link.url,{signal:controller.signal,headers:offset?{Range:`bytes=${offset}-`}:{}});
    if(revision!==j.rev)return;if(!response.ok)throw Error('HTTP '+response.status);
    const range=response.headers.get('Content-Range');
    if(offset&&response.status===206&&!range?.startsWith('bytes '+offset+'-'))throw Error('Invalid resumed range');
    if(response.status!==206){j.bytes=0;j.chunks=[];}
    const length=Number(response.headers.get('Content-Length'));if(length>0)j.total=j.bytes+length;
    if(j.total>50*1048576)throw Error('Package exceeds 50 MB');
    const reader=response.body.getReader();let then=performance.now(),last=j.bytes;
    for(;;){const {value,done}=await reader.read();if(done)break;if(revision!==j.rev||j.status!=='running'){await reader.cancel();return;}j.chunks.push(value);j.bytes+=value.byteLength;if(j.bytes>50*1048576)throw Error('Package exceeds 50 MB');const now=performance.now();if(now-then>=250){j.speed=(j.bytes-last)/((now-then)/1000);then=now;last=j.bytes;emit();}}
    if(revision!==j.rev||j.status!=='running')return;
    if(j.total&&j.bytes!==j.total)throw Error('Incomplete download');
    const file=new Blob(j.chunks,{type:'application/octet-stream'});const head=new Uint8Array(await file.slice(0,2).arrayBuffer());if(head[0]!==80||head[1]!==75)throw Error('Invalid Minecraft package');
    j.blob=URL.createObjectURL(file);j.chunks=[];j.total=j.bytes;j.status='complete';j.available=true;j.speed=0;saveBrowser(j);emit();
  }catch(e){if(context!==owner||revision!==j.rev)return;if(['paused','canceled'].includes(j.status))return;j.status='failed';j.error=e.message;j.speed=0;emit();}finally{if(running.get(j.id)===controller)running.delete(j.id);}}
  function pause(id){const j=jobs.get(id);if(!j||j.status!=='running')return;j.rev=(j.rev||0)+1;j.status='paused';j.speed=0;if(native?.pauseDownload)native.pauseDownload(id);else running.get(id)?.abort();emit();}
  async function resume(id){const j=jobs.get(id);if(!j||!['paused','failed','interrupted'].includes(j.status))return;if(j.status==='interrupted'){j.bytes=0;j.chunks=[];}await run(j);}
  function cancel(id){const j=jobs.get(id);if(!j)return;j.rev=(j.rev||0)+1;j.status='canceled';j.speed=0;if(native?.cancelDownload)native.cancelDownload(id);running.get(id)?.abort();j.chunks=[];j.bytes=0;emit();}
  function receive(event){const j=jobs.get(event.id);if(!j||j.status==='canceled')return;if(j.status==='paused'&&event.status==='running')return;Object.assign(j,{status:event.status,bytes:event.bytes,total:event.total||j.total,speed:event.speed||0,error:event.error||''});if(event.status==='complete')j.available=true;emit();}
  function saveBrowser(j){const a=document.createElement('a');a.href=j.blob;a.download=j.filename;a.click();}
  function open(id){const j=jobs.get(id);if(!j)return;if(native?.openDownload){native.openDownload(j.filename);return;}if(j.blob)saveBrowser(j);}
  function clear(){if([...jobs.values()].some(j=>['running','paused','queued'].includes(j.status)))throw Error('Finish or cancel active downloads first / أكمل أو ألغ التنزيلات أولاً');if(native?.clearDownloads&&native.clearDownloads()===false)throw Error('Could not clear local files. Finish active transfers and try again.');for(const j of jobs.values())if(j.blob)URL.revokeObjectURL(j.blob);jobs.clear();emit();}
  return {jobs,start,pause,resume,cancel,receive,open,clear,setOwner};
}
