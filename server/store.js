import fs from 'node:fs';
import path from 'node:path';
export function createStore(dir, seed) {
 fs.mkdirSync(dir,{recursive:true}); const file=path.join(dir,'db.json');
 const db=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):seed;
 const save=()=>{fs.writeFileSync(file+'.tmp',JSON.stringify(db,null,2),{mode:0o600});fs.renameSync(file+'.tmp',file);};
 save(); return {db,save};
}
export const categories=['All mods','Add-ons','Textures','Worlds','Skins'];
export function validMod(body) {
 const {title,description,category,version}=body;
 if(typeof title!=='string'||title.trim().length<3||title.length>80) return 'Title must be 3–80 characters.';
 if(typeof description!=='string'||description.trim().length<15||description.length>5000) return 'Description must be 15–5,000 characters.';
 if(!categories.slice(1).includes(category)) return 'Choose a valid category.';
 if(typeof version!=='string'||!/^\d+\.\d+(\.\d+)?$/.test(version)) return 'Use a Minecraft version such as 1.21.';
 if(!Number.isFinite(Number(body.editorRating))||Number(body.editorRating)<1||Number(body.editorRating)>5) return 'Rating must be between 1 and 5.';
 return null;
}
