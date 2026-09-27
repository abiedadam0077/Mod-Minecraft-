import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// PostgreSQL integration test with minimal Supabase auth/storage stubs.
// This exercises real SQL/RLS locally; it is not a remote Supabase deployment test.
test('Supabase migration is repeatable and enforces user/admin/storage boundaries',async()=>{
 const db=new PGlite();
 const admin='10000000-0000-4000-8000-000000000001';
 const alice='10000000-0000-4000-8000-000000000002';
 const bob='10000000-0000-4000-8000-000000000003';
 const mod='20000000-0000-4000-8000-000000000001';
 const draft='20000000-0000-4000-8000-000000000002';
 const use=async(role,id='')=>db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}',false);`);
 try {
  await db.exec(`
   create role anon nologin; create role authenticated nologin;
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
  const sql=fs.readFileSync('supabase/migrations/202609270001_craftly.sql','utf8');
  await db.exec(sql);await db.exec(sql);
  assert.equal((await db.query(`select role from public.craftly_profiles where id='${bob}'`)).rows[0].role,'user');
  await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values
    ('${admin}','admin@example.test','{"name":"Admin"}'),
    ('${alice}','alice@example.test','{"name":"Alice","role":"admin"}');
    update public.craftly_profiles set role='admin' where id='${admin}';`);
  assert.equal((await db.query(`select role from public.craftly_profiles where id='${alice}'`)).rows[0].role,'user');
  const insertMod=(id,published)=>`insert into public.craftly_mods(id,title,description,category,minecraft_version,cover_path,package_path,file_size,published)
     values ('${id}','Test pack','A package used in permission tests.','Add-ons','1.21','${id}/cover.webp','${id}/addon.mcpack',100,${published});`;
  await use('authenticated',admin);
  await db.exec(insertMod(mod,true));await db.exec(insertMod(draft,false));
  await db.exec(`insert into storage.objects(bucket_id,name) values
   ('craftly-covers','${mod}/cover.webp'),('craftly-packages','${mod}/addon.mcpack'),('craftly-packages','${draft}/addon.mcpack');`);
  assert.equal((await db.query('select * from public.craftly_mods')).rows.length,2);
  await use('anon');
  assert.equal((await db.query('select * from public.craftly_mods')).rows.length,1);
  assert.equal((await db.query("select * from storage.objects where bucket_id='craftly-packages'")).rows.length,0);
  await assert.rejects(db.query('select * from public.craftly_profiles'),/permission denied/);
  await assert.rejects(db.query(`select public.craftly_record_download('${mod}')`),/permission denied/);
  await use('authenticated',alice);
  await assert.rejects(db.query(`update public.craftly_profiles set role='admin' where id='${alice}'`),/permission denied/);
  await assert.rejects(db.query(`insert into public.craftly_profiles(id,display_name,role) values ('${alice}','A','admin')`),/permission denied/);
  await db.exec(`update public.craftly_profiles set display_name='Explorer' where id='${alice}'`);
  assert.equal((await db.query('select * from public.craftly_profiles')).rows.length,1);
  assert.equal((await db.query('select public.craftly_is_admin() as admin')).rows[0].admin,false);
  await assert.rejects(db.query(insertMod('20000000-0000-4000-8000-000000000003',true)),/row-level security/);
  await db.exec(`delete from public.craftly_mods where id='${mod}'`);
  assert.equal((await db.query('select * from public.craftly_mods')).rows.length,1);
  await assert.rejects(db.query(`insert into storage.objects(bucket_id,name) values ('craftly-packages','${mod}/malicious.mcpack')`),/row-level security/);
  assert.equal((await db.query("select * from storage.objects where bucket_id='craftly-packages'")).rows.length,1);
  await db.exec(`insert into public.craftly_favorites(mod_id) values ('${mod}'); insert into public.craftly_ratings(mod_id,rating) values ('${mod}',5);`);
  await assert.rejects(db.query(`insert into public.craftly_favorites(user_id,mod_id) values ('${bob}','${mod}')`),/row-level security/);
  await assert.rejects(db.query(`insert into public.craftly_favorites(mod_id) values ('${draft}')`),/row-level security/);
  await assert.rejects(db.query(`update public.craftly_ratings set rating=6`),/check constraint/);
  await assert.rejects(db.query(`insert into public.craftly_downloads(user_id,mod_id) values ('${alice}','${mod}')`),/permission denied/);
  await db.exec(`select public.craftly_record_download('${mod}'); select public.craftly_record_download('${mod}');`);
  assert.equal((await db.query('select * from public.craftly_downloads')).rows.length,1);
  await assert.rejects(db.query(`select public.craftly_record_download('${draft}')`),/Published mod not found/);
  await use('authenticated',bob);
  for(const table of ['craftly_favorites','craftly_ratings','craftly_downloads'])assert.equal((await db.query('select * from public.'+table)).rows.length,0);
  await db.exec(`insert into public.craftly_ratings(mod_id,rating) values ('${mod}',3);`);
  await use('anon');
  const stats=(await db.query('select * from public.craftly_mod_stats()')).rows;
  assert.equal(stats.length,1);assert.equal(Number(stats[0].rating),4);assert.equal(Number(stats[0].rating_count),2);assert.equal(Number(stats[0].download_requests),1);
  await use('authenticated',admin);
  await db.exec(`delete from public.craftly_mods where id='${mod}'`);
  await use('authenticated',alice);
  assert.equal((await db.query('select * from public.craftly_favorites')).rows.length,0);
  assert.equal((await db.query("select * from storage.objects where bucket_id='craftly-packages'")).rows.length,0);
 }finally {await db.close();}
});
