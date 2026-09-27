// Read-only live check: public key only, never signs into anyone's account.
import fs from 'node:fs';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from '../src/cloud-config.js';
const results=[];
for(const [name,path,method,expected] of [
 ['catalog','/rest/v1/craftly_mods?select=id&limit=1','GET',[200]],
 ['rating aggregates','/rest/v1/rpc/craftly_mod_stats','POST',[200]],
 ['private profiles denied to guests','/rest/v1/craftly_profiles?select=id&limit=1','GET',[401,403]],
 ['auth configuration','/auth/v1/settings','GET',[200]],
]){
 const response=await fetch(SUPABASE_URL+path,{method,headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:method==='POST'?'{}':undefined,signal:AbortSignal.timeout(30000)});
 const ok=expected.includes(response.status);results.push({name,status:response.status,ok});
 console.log(`${ok?'PASS':'FAIL'} ${name}: HTTP ${response.status}`);
 if(!ok)throw Error(`Supabase check failed: ${name} (${response.status}). Check URL, public key and SQL migration.`);
}
fs.mkdirSync('artifacts',{recursive:true});
fs.writeFileSync('artifacts/CONNECTIVITY.json',JSON.stringify({checkedAt:new Date().toISOString(),project:SUPABASE_URL,checks:results,note:'Read-only public/API checks. No real admin session or Minecraft-device test.'},null,2));
