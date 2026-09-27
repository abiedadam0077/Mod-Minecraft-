import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import {randomUUID,randomBytes} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createStore,validMod} from './store.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=process.env.DATA_DIR||path.join(root,'server/data');
fs.mkdirSync(path.join(data,'uploads'),{recursive:true});
const names=[['Natural Horizons','Textures','Give your everyday world a little wonder. Soft lighting, clearer water, and lush foliage bring a fresh perspective to every adventure.','overworld',4.9],['Dragon Realms','Add-ons','Meet extraordinary dragons, explore floating islands, and make your next adventure truly legendary.','dragon',4.8],['Cozy Cottage Life','Worlds','Slow down and settle into a beautifully detailed cottage village. Your next chapter starts at home.','cottage',4.9],['Better Adventures','Add-ons','Discover new places and bring a little more adventure to your favorite blocky world.','overworld',4.7],['Enchanted Skies','Textures','Dreamy violet skies and a magical atmosphere for a completely new perspective.','dragon',4.8],['Autumn Retreat','Worlds','Wander through golden fields and a peaceful village built for your next creative escape.','cottage',4.6]];
const {db,save}=createStore(data,{users:[],sessions:[],mods:names.map(([title,category,description,image,editorRating],i)=>({id:`preview-${i}`,title,category,description,image:`/images/${image}.webp`,editorRating,version:'1.21',downloads:0,createdAt:new Date(Date.now()-i*86400000).toISOString(),preview:true,ratings:{},size:0})),downloads:[]});
if(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && !db.users.some(u=>u.role==='admin')) {if(process.env.ADMIN_PASSWORD.length<12)throw Error('Admin password needs at least 12 characters');db.users.push({id:randomUUID(),name:'Studio admin',email:process.env.ADMIN_EMAIL.toLowerCase(),password:bcrypt.hashSync(process.env.ADMIN_PASSWORD,12),role:'admin',favorites:[]});save();}
const app=express(); app.disable('x-powered-by'); app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:false,crossOriginResourcePolicy:{policy:'cross-origin'}}));
app.use(cors({origin:process.env.ALLOWED_ORIGINS?process.env.ALLOWED_ORIGINS.split(','):true}));
app.use(express.json({limit:'32kb'}));
app.use('/api',rateLimit({windowMs:60000,limit:180}));
const authLimit=rateLimit({windowMs:15*60000,limit:30});
function user(req){const token=req.headers.authorization?.replace(/^Bearer /,'');const s=db.sessions.find(s=>s.token===token&&s.expires>Date.now());return s&&db.users.find(u=>u.id===s.userId);}
function auth(req,res,next){req.user=user(req);if(!req.user)return res.status(401).json({error:'Please sign in to continue.'});next();}
function admin(req,res,next){if(req.user.role!=='admin')return res.status(403).json({error:'Administrator access required.'});next();}
const safeUser=u=>({id:u.id,name:u.name,email:u.email,role:u.role,favorites:u.favorites||[]});
const safeMod=m=>({...m,file:undefined,ratings:undefined,rating:Object.keys(m.ratings||{}).length?Object.values(m.ratings).reduce((a,b)=>a+b,0)/Object.keys(m.ratings).length:m.editorRating,ratingCount:Object.keys(m.ratings||{}).length});
app.get('/api/health',(_,res)=>res.json({ok:true,adminConfigured:db.users.some(u=>u.role==='admin')}));
app.post('/api/auth/register',authLimit,async(req,res)=>{const {name,email,password}=req.body;if(typeof name!=='string'||name.trim().length<2||name.length>60||typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>180||typeof password!=='string'||password.length<8||password.length>128)return res.status(400).json({error:'Enter a name, valid email and a password of 8–128 characters.'});if(db.users.some(u=>u.email===email.toLowerCase()))return res.status(409).json({error:'This email is already registered.'});const hashed=await bcrypt.hash(password,12);if(db.users.some(u=>u.email===email.toLowerCase()))return res.status(409).json({error:'This email is already registered.'});const u={id:randomUUID(),name:name.trim(),email:email.toLowerCase(),password:hashed,role:'user',favorites:[]};db.users.push(u);session(u,res);});
function session(u,res){const token=randomBytes(32).toString('hex');db.sessions=db.sessions.filter(s=>s.expires>Date.now());db.sessions.push({token,userId:u.id,expires:Date.now()+7*86400000});save();res.json({token,user:safeUser(u)});}
app.post('/api/auth/login',authLimit,async(req,res)=>{const {email,password}=req.body;if(typeof email!=='string'||typeof password!=='string'||password.length>128)return res.status(400).json({error:'Enter your email and password.'});const u=db.users.find(u=>u.email===email.toLowerCase());if(!u||!await bcrypt.compare(password,u.password))return res.status(401).json({error:'Email or password is incorrect.'});session(u,res);});
app.post('/api/auth/logout',auth,(req,res)=>{db.sessions=db.sessions.filter(s=>s.token!==req.headers.authorization.slice(7));save();res.json({ok:true});});
app.get('/api/me',auth,(req,res)=>res.json(safeUser(req.user)));
app.get('/api/mods',(_,res)=>res.json(db.mods.map(safeMod)));
app.post('/api/favorites/:id',auth,(req,res)=>{if(!db.mods.some(m=>m.id===req.params.id))return res.sendStatus(404);const list=req.user.favorites||[];req.user.favorites=list.includes(req.params.id)?list.filter(id=>id!==req.params.id):[...list,req.params.id];save();res.json(req.user.favorites);});
app.post('/api/mods/:id/rating',auth,(req,res)=>{const m=db.mods.find(m=>m.id===req.params.id);if(!m)return res.sendStatus(404);const r=req.body.rating;if(!Number.isInteger(r)||r<1||r>5)return res.status(400).json({error:'Choose 1 to 5 stars.'});m.ratings[req.user.id]=r;save();res.json(safeMod(m));});
const storage=multer.diskStorage({destination:path.join(data,'uploads'),filename:(_,file,cb)=>cb(null,randomUUID()+path.extname(file.originalname).toLowerCase())});
const upload=multer({storage,limits:{fileSize:100*1024*1024,files:2,fields:10},fileFilter:(_,f,cb)=>cb(null,f.fieldname==='image'?/\.(png|jpe?g|webp)$/i.test(f.originalname):f.fieldname==='file'&&/\.(mcaddon|mcpack|mcworld)$/i.test(f.originalname))}).fields([{name:'image',maxCount:1},{name:'file',maxCount:1}]);
const cleanup=req=>Object.values(req.files||{}).flat().forEach(f=>{try{fs.unlinkSync(f.path);}catch{}});
app.post('/api/admin/mods',auth,admin,(req,res,next)=>upload(req,res,err=>{if(err){cleanup(req);return next(err);}const invalid=validMod(req.body);const image=req.files?.image?.[0],file=req.files?.file?.[0];if(invalid||!image||!file){cleanup(req);return res.status(400).json({error:invalid||'Add a PNG/JPEG/WebP cover and a .mcaddon, .mcpack or .mcworld file.'});}
 const readHead=(p,n)=>{const fd=fs.openSync(p,'r');const b=Buffer.alloc(n);fs.readSync(fd,b,0,n,0);fs.closeSync(fd);return b;};
 const ih=readHead(image.path,12),fh=readHead(file.path,4);const validImage=(ih[0]===137&&ih.toString('ascii',1,4)==='PNG')||(ih[0]===255&&ih[1]===216)||(ih.toString('ascii',0,4)==='RIFF'&&ih.toString('ascii',8,12)==='WEBP');
 if(!validImage||fh[0]!==80||fh[1]!==75||image.size>8*1024*1024){cleanup(req);return res.status(400).json({error:'Use a valid image under 8 MB and a ZIP-based Minecraft package.'});}
 const m={id:randomUUID(),title:req.body.title.trim(),description:req.body.description.trim(),category:req.body.category,version:req.body.version,editorRating:Number(req.body.editorRating),image:'/uploads/'+image.filename,file:file.filename,size:file.size,downloads:0,ratings:{},preview:false,createdAt:new Date().toISOString()};db.mods.unshift(m);save();res.status(201).json(safeMod(m));}));
app.delete('/api/admin/mods/:id',auth,admin,(req,res)=>{const m=db.mods.find(m=>m.id===req.params.id);if(!m)return res.sendStatus(404);db.mods=db.mods.filter(x=>x.id!==m.id);for(const u of db.users)u.favorites=(u.favorites||[]).filter(id=>id!==m.id);save();for(const f of [m.file,m.image.startsWith('/uploads/')?path.basename(m.image):null])if(f)try{fs.unlinkSync(path.join(data,'uploads',f));}catch{}res.json({ok:true});});
app.get('/uploads/:name',(req,res)=>{const m=db.mods.find(m=>m.image==='/uploads/'+req.params.name);if(!m)return res.sendStatus(404);res.sendFile(path.join(data,'uploads',req.params.name));});
const tickets=new Map();
app.post('/api/mods/:id/download',auth,(req,res)=>{const m=db.mods.find(m=>m.id===req.params.id);if(!m?.file)return res.status(409).json({error:'This is a design preview. An admin must upload a real Minecraft package before it can be downloaded.'});for(const [key,t] of tickets)if(t.expires<Date.now())tickets.delete(key);const ticket=randomBytes(24).toString('hex');tickets.set(ticket,{modId:m.id,userId:req.user.id,expires:Date.now()+10*60000});res.json({url:'/api/download/'+ticket,filename:m.title.replace(/[^\w-]/g,'_')+path.extname(m.file)});});
app.get('/api/download/:ticket',(req,res)=>{const t=tickets.get(req.params.ticket);if(!t||t.expires<Date.now())return res.status(403).json({error:'Download link expired. Please try again.'});const m=db.mods.find(m=>m.id===t.modId);if(!m?.file)return res.sendStatus(404);res.download(path.join(data,'uploads',m.file),m.title.replace(/[^\w-]/g,'_')+path.extname(m.file),err=>{if(!err&&!t.counted){t.counted=true;m.downloads++;db.downloads.unshift({id:randomUUID(),userId:t.userId,modId:m.id,title:m.title,image:m.image,date:new Date().toISOString()});save();}});});
app.get('/api/downloads',auth,(req,res)=>res.json(db.downloads.filter(d=>d.userId===req.user.id)));
app.get('/api/admin/stats',auth,admin,(_,res)=>res.json({mods:db.mods.filter(m=>!m.preview).length,downloads:db.downloads.length,users:db.users.filter(u=>u.role==='user').length}));
app.use(express.static(path.join(root,'dist')));
app.get('/{*splat}',(req,res)=>{if(req.path.startsWith('/api/'))return res.status(404).json({error:'Not found'});res.sendFile(path.join(root,'dist/index.html'));});
app.use((err,req,res,next)=>{console.error(err.message);res.status(err instanceof multer.MulterError?400:500).json({error:err instanceof multer.MulterError?'Upload exceeds the file limit (100 MB).':'Something went wrong. Please try again.'});});
app.listen(process.env.PORT||3001,'0.0.0.0',()=>console.log('Craftly API listening on '+(process.env.PORT||3001)));
