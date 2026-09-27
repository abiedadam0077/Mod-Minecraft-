import test from 'node:test';
import assert from 'node:assert/strict';
import {validateUpload} from '../src/cloud.js';
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
const zip=Buffer.from('504b0506000000000000000000000000000000000000','hex');
function form(){const f=new FormData();for(const [k,v]of Object.entries({title:'Test pack',description:'Validating an upload test fixture.',category:'Add-ons',version:'1.21',editorRating:'4.5'}))f.set(k,v);f.set('image',new File([image],'cover.png'));f.set('file',new File([zip],'pack.mcpack'));return f;}
test('Supabase upload validation: known package, metadata, image signatures and 50 MB cap',async()=>{
 const valid=await validateUpload(form());assert.equal(valid.mime,'image/png');assert.equal(valid.ext,'mcpack');
 for(const [key,value] of [['title','a'],['version','1.bad'],['category','Java'],['editorRating','8']]){const f=form();f.set(key,value);await assert.rejects(validateUpload(f));}
 const f=form();f.set('image',new File(['not an image'],'cover.png'));await assert.rejects(validateUpload(f),/Invalid image/);
 const g=form();g.set('file',new File(['not a zip'],'pack.mcaddon'));await assert.rejects(validateUpload(g),/Invalid image or ZIP/);
 const h=form();h.set('file',new File([new Uint8Array(50*1048576+1)],'large.mcpack'));await assert.rejects(validateUpload(h),/50 MB/);
});
