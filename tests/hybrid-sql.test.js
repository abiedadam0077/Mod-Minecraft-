import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('hybrid migration: repeatability, manual compatibility, external uniqueness, source RLS, expiry, paging, locks and tombstones',async()=>{
 const db=new PGlite();const bob='10000000-0000-4000-8000-000000000003',admin='10000000-0000-4000-8000-000000000001';
 const use=async(role,id='')=>db.exec(`reset role;set role ${role};select set_config('request.jwt.claim.sub','${id}',false);`);
 try{
  await db.exec(`
   create role service_role nologin bypassrls; create role anon nologin; create role authenticated nologin;
   create schema auth; create schema storage;
   create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to anon,authenticated;
   grant execute on function auth.uid() to anon,authenticated;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text references storage.buckets(id),name text);
   alter table storage.objects enable row level security;
   grant usage on schema storage to anon,authenticated;
   grant select,insert,update,delete on storage.objects to anon,authenticated;
   insert into auth.users(id,email,raw_user_meta_data) values ('${bob}','bob@example.test','{"name":"Bob","role":"admin"}');
  `);

 await db.exec(fs.readFileSync('supabase/migrations/202609270001_craftly.sql','utf8'));
 await db.exec(`insert into auth.users(id,email) values ('${admin}','owner@example.test');update public.craftly_profiles set role='admin' where id='${admin}';`);
 const manual='20000000-0000-4000-8000-000000000001';
 await db.exec(`insert into public.craftly_mods(id,title,description,category,minecraft_version,cover_path,package_path,file_size) values('${manual}','Original pack','A manually uploaded package.','Add-ons','1.21','${manual}/cover.webp','${manual}/pack.mcpack',100);`);
 const sql=fs.readFileSync('supabase/migrations/202609280001_hybrid_catalog.sql','utf8');await db.exec(sql);await db.exec(sql);
 assert.equal((await db.query('select source_type from craftly_mods')).rows[0].source_type,'manual');
 await db.exec(`update craftly_sources set enabled=true,status='Connected' where id='creator-feed';`);
 const ext=(id,expiry="now()+interval '1 day'")=>`insert into craftly_mods(title,description,category,minecraft_version,source_type,source,external_id,source_url,expires_at,editor_rating,updated_at) values('Imported pack ${id}','Creator summary','Shaders','Unknown','external','creator-feed','${id}','https://creator.example.com/${id}',${expiry},null,now())`;
 await db.exec(ext('a'));await db.exec(ext('b'));await db.exec(ext('expired',"now()-interval '1 hour'"));
 await assert.rejects(db.exec(ext('a')),/duplicate key/);
 await use('anon');await assert.rejects(db.query('select * from craftly_sources'),/permission denied/);
 let page=(await db.query("select craftly_catalog_page(p_limit=>2) as value")).rows[0].value;assert.equal(page.items.length,2);assert.equal(page.hasMore,true);
 page=(await db.query("select craftly_catalog_page(p_category=>'Shaders',p_limit=>1,p_offset=>1) as value")).rows[0].value;assert.equal(page.items.length,1);assert.equal(page.hasMore,false);
 assert.equal((await db.query('select * from craftly_mods')).rows.length,3);
 await assert.rejects(db.query("select craftly_claim_source('creator-feed')"),/permission denied/);
 await use('authenticated',bob);assert.equal((await db.query('select * from craftly_sources')).rows.length,0);await assert.rejects(db.query("select craftly_hide_external(gen_random_uuid())"),/Administrator/);
 await use('authenticated',admin);assert.equal((await db.query('select * from craftly_sources')).rows.length,2);await assert.rejects(db.exec(ext('client-forgery')),/row-level security/);
 const id=(await db.query("select id from craftly_mods where external_id='a'")).rows[0].id;await db.query(`select craftly_hide_external('${id}')`);
 await use('postgres');await db.exec(ext('a'));assert.equal((await db.query("select * from craftly_mods where external_id='a'")).rows.length,0);
 assert.equal((await db.query("select * from craftly_claim_source('creator-feed')")).rows.length,1);assert.equal((await db.query("select * from craftly_claim_source('creator-feed')")).rows.length,0);
 await db.exec("update craftly_sources set enabled=false where id='creator-feed'");await use('anon');assert.equal((await db.query('select * from craftly_mods')).rows.length,1);
 }finally{await db.close();}
});
