begin;
alter table public.craftly_mods add column if not exists source_type text not null default 'manual' check(source_type in ('manual','external'));
alter table public.craftly_mods add column if not exists source text not null default 'manual';
alter table public.craftly_mods add column if not exists source_url text;
alter table public.craftly_mods add column if not exists external_id text;
alter table public.craftly_mods add column if not exists download_url text;
alter table public.craftly_mods add column if not exists author text not null default '';
alter table public.craftly_mods add column if not exists tags text[] not null default '{}';
alter table public.craftly_mods add column if not exists thumbnail text;
alter table public.craftly_mods add column if not exists screenshots text[] not null default '{}';
alter table public.craftly_mods add column if not exists screenshot_paths text[] not null default '{}';
alter table public.craftly_mods add column if not exists minecraft_versions text[] not null default '{}';
alter table public.craftly_mods add column if not exists file_type text;
alter table public.craftly_mods add column if not exists source_rating numeric check(source_rating between 1 and 5);
alter table public.craftly_mods add column if not exists source_downloads bigint check(source_downloads>=0);
alter table public.craftly_mods add column if not exists usage_information text;
alter table public.craftly_mods add column if not exists updated_at timestamptz;
alter table public.craftly_mods add column if not exists checked_at timestamptz;
alter table public.craftly_mods add column if not exists metadata_hash text;
alter table public.craftly_mods add column if not exists expires_at timestamptz;
alter table public.craftly_mods alter column cover_path drop not null;
alter table public.craftly_mods alter column package_path drop not null;
alter table public.craftly_mods alter column file_size drop not null;
alter table public.craftly_mods alter column editor_rating drop not null;
alter table public.craftly_mods drop constraint if exists craftly_mods_category_check;
alter table public.craftly_mods add constraint craftly_mods_category_check check(category in ('Add-ons','Textures','Worlds','Skins','Mods','Shaders','Maps','Scripts'));
alter table public.craftly_mods drop constraint if exists craftly_mods_file_size_check;
alter table public.craftly_mods add constraint craftly_mods_file_size_check check(file_size>0 and (source_type='external' or file_size<=52428800));
alter table public.craftly_mods drop constraint if exists craftly_mods_hybrid_shape;
alter table public.craftly_mods add constraint craftly_mods_hybrid_shape check(
 (source_type='manual' and source='manual' and cover_path is not null and editor_rating is not null and ((package_path is not null and file_size is not null) or download_url ~ '^https://')) or
 (source_type='external' and source in ('curseforge','creator-feed') and external_id is not null and source_url ~ '^https://' and package_path is null and download_url is null and expires_at is not null));
alter table public.craftly_mods drop constraint if exists craftly_mods_minecraft_version_check;
alter table public.craftly_mods add constraint craftly_mods_minecraft_version_check check(minecraft_version ~ '^[0-9]+[.][0-9]+([.][0-9]+)?$' or (source_type='external' and minecraft_version='Unknown'));
alter table public.craftly_mods drop constraint if exists craftly_mods_description_check;
alter table public.craftly_mods add constraint craftly_mods_description_check check(char_length(description)<=5000 and (source_type='external' or char_length(description)>=15));
create unique index if not exists craftly_external_identity on public.craftly_mods(source,external_id);
create unique index if not exists craftly_external_canonical_url on public.craftly_mods(source_url) where source_type='external';
create index if not exists craftly_mods_updated on public.craftly_mods(greatest(updated_at,created_at) desc,id);
create index if not exists craftly_mods_category_source on public.craftly_mods(category,source);
create index if not exists craftly_mods_search on public.craftly_mods using gin(to_tsvector('simple',title||' '||description||' '||author));
create table if not exists public.craftly_sources(
 id text primary key check(id in ('curseforge','creator-feed')), name text not null,
 enabled boolean not null default false, status text not null default 'Disabled',
 last_sync timestamptz, next_sync timestamptz not null default now(), lease_until timestamptz,
 cursor_index integer not null default 0, run_number bigint not null default 0,
 imported_items integer not null default 0,new_items integer not null default 0,updated_items integer not null default 0,failed_items integer not null default 0,
 error text,updated_at timestamptz not null default now());
insert into public.craftly_sources(id,name) values('curseforge','CurseForge Bedrock'),('creator-feed','Approved creator feed') on conflict do nothing;
create table if not exists public.craftly_external_blocks(source text not null,external_id text not null,primary key(source,external_id));
alter table public.craftly_sources enable row level security;
alter table public.craftly_external_blocks enable row level security;
revoke all on public.craftly_sources, public.craftly_external_blocks from public,anon,authenticated;
grant select on public.craftly_sources to authenticated;
drop policy if exists craftly_sources_read on public.craftly_sources;
create policy craftly_sources_read on public.craftly_sources for select to authenticated using(public.craftly_is_admin());
-- Only backend service_role can change source configuration or import records.
drop policy if exists craftly_catalog_admin on public.craftly_mods;
create policy craftly_catalog_admin on public.craftly_mods for all to authenticated using(public.craftly_is_admin()) with check(public.craftly_is_admin() and source_type='manual');
create or replace function public.craftly_external_visible(p_source text) returns boolean
language sql stable security definer set search_path='' as $$ select exists(select 1 from public.craftly_sources where id=p_source and enabled) $$;
revoke all on function public.craftly_external_visible(text) from public;
grant execute on function public.craftly_external_visible(text) to anon,authenticated;
drop policy if exists craftly_catalog_public on public.craftly_mods;
create policy craftly_catalog_public on public.craftly_mods for select to anon,authenticated using(published and (source_type='manual' or (expires_at>now() and public.craftly_external_visible(source))));
create or replace function public.craftly_catalog_page(p_category text default 'All mods',p_version text default 'all',p_source text default 'all',p_search text default '',p_sort text default 'new',p_rating numeric default 0,p_offset integer default 0,p_limit integer default 24,p_ids uuid[] default null)
returns jsonb language sql stable security definer set search_path='' as $$
 with candidates as (
 select m.*,coalesce(r.average,m.source_rating,m.editor_rating) as rating,coalesce(r.total,0) as rating_count,
 coalesce(m.source_downloads,d.total,0) as download_requests
 from public.craftly_mods m
 left join lateral (select avg(rating) as average,count(*) as total from public.craftly_ratings r where r.mod_id=m.id) r on true
 left join lateral (select count(*) as total from public.craftly_downloads d where d.mod_id=m.id) d on true
 where m.published and (m.source_type='manual' or (m.expires_at>now() and public.craftly_external_visible(m.source)))
 and (p_category='All mods' or m.category=p_category or (p_category='Maps / Worlds' and m.category in ('Maps','Worlds')))
 and (p_source='all' or m.source=p_source)
 and (p_version='all' or m.minecraft_version=p_version or m.minecraft_version like p_version||'.%' or exists(select 1 from unnest(m.minecraft_versions) v where v=p_version or v like p_version||'.%'))
 and (p_ids is null or m.id=any(p_ids))
 and (p_search='' or (m.title||' '||m.description||' '||m.author||' '||array_to_string(m.tags,' ')) ilike '%'||left(p_search,100)||'%')
 ), filtered as (select * from candidates where p_rating<=0 or rating>=p_rating), page as (
 select * from filtered order by
 case when p_sort='rating' then rating end desc nulls last,
 case when p_sort='downloads' then download_requests end desc nulls last,
 case when p_sort='updated' then greatest(updated_at,created_at) end desc nulls last,
 created_at desc,id asc offset greatest(0,least(p_offset,10000)) limit greatest(1,least(p_limit,48))+1
 ), numbered as (select *,row_number() over() as row_num from page)
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(numbered)-'row_num' order by row_num) filter(where row_num<=greatest(1,least(p_limit,48))),'[]'::jsonb),'hasMore',count(*)>greatest(1,least(p_limit,48))) from numbered;
$$;
revoke all on function public.craftly_catalog_page(text,text,text,text,text,numeric,integer,integer,uuid[]) from public;
grant execute on function public.craftly_catalog_page(text,text,text,text,text,numeric,integer,integer,uuid[]) to anon,authenticated;
create or replace function public.craftly_claim_source(p_source text) returns setof public.craftly_sources
language sql security definer set search_path='' as $$
 update public.craftly_sources set lease_until=now()+interval '5 minutes',next_sync=now()+interval '15 minutes',status='Syncing',run_number=run_number+1
 where id=p_source and enabled and next_sync<=now() and (lease_until is null or lease_until<now()) returning *;
$$;
revoke all on function public.craftly_claim_source(text) from public,anon,authenticated;
-- Supabase service_role exists in hosted projects. Local tests create it explicitly.
grant all on public.craftly_sources,public.craftly_external_blocks,public.craftly_mods to service_role;
grant execute on function public.craftly_claim_source(text) to service_role;
create or replace function public.craftly_hide_external(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.craftly_is_admin() then raise exception 'Administrator required';end if;
 insert into public.craftly_external_blocks(source,external_id) select source,external_id from public.craftly_mods where id=p_id and source_type='external' on conflict do nothing;
 delete from public.craftly_mods where id=p_id and source_type='external';
end;$$;
revoke all on function public.craftly_hide_external(uuid) from public,anon;
grant execute on function public.craftly_hide_external(uuid) to authenticated;
create or replace function public.craftly_block_import() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.source_type='external' and (not public.craftly_external_visible(new.source) or exists(select 1 from public.craftly_external_blocks where source=new.source and external_id=new.external_id)) then return null;end if;
 return new;
end;$$;
revoke all on function public.craftly_block_import() from public;
drop trigger if exists craftly_block_import on public.craftly_mods;
create trigger craftly_block_import before insert or update on public.craftly_mods for each row execute function public.craftly_block_import();
notify pgrst,'reload schema';
commit;
