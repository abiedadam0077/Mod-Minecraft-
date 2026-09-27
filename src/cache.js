// In-memory only: never persist roles, signed URLs, passwords or private query results.
export function createQueryCache({now=Date.now}={}) {
 const entries=new Map(),pending=new Map();let epoch=0;
 async function read(key,loader,{ttl=30000,force=false}={}){
  const found=entries.get(key);if(!force&&found&&found.until>now())return found.value;
  if(pending.has(key))return pending.get(key);
  const generation=epoch;
  const promise=Promise.resolve().then(loader).then(value=>{if(generation===epoch)entries.set(key,{value,until:now()+ttl});return value;}).finally(()=>{if(pending.get(key)===promise)pending.delete(key);});
  pending.set(key,promise);return promise;
 }
 function invalidate(prefix=''){epoch++;for(const key of entries.keys())if(key.startsWith(prefix))entries.delete(key);for(const key of pending.keys())if(key.startsWith(prefix))pending.delete(key);}
 return {read,invalidate};
}
export function shouldShowWelcome({hasSession,seen}){return !hasSession&&!seen;}
