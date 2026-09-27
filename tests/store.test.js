import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createStore,validMod} from '../server/store.js';
const good={title:'Natural Horizons',description:'A beautiful new texture pack.',category:'Textures',version:'1.21',editorRating:'4.8'};
test('validates mod metadata and versions',()=>{assert.equal(validMod(good),null);for(const invalid of [{title:'a'},{category:'Java'},{version:'hello'},{editorRating:9},{description:'short'}])assert.ok(validMod({...good,...invalid}));});
test('persists changes atomically',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'craftly-'));try{const s=createStore(dir,{mods:[]});s.db.mods.push(good);s.save();assert.equal(createStore(dir,{}).db.mods[0].title,good.title);assert.equal(fs.existsSync(path.join(dir,'db.json.tmp')),false);}finally{fs.rmSync(dir,{recursive:true});}});
