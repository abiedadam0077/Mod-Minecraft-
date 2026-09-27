-- Craftly / Supabase setup v1
-- Run the WHOLE file in Supabase Dashboard > SQL Editor.
-- No password or API key belongs in this file.
-- Safe to rerun this version. Does not delete accounts, mods or files.
-- IMPORTANT: this prepares Supabase; the original Express APK is not compatible yet.

begin;

create table if not exists public.craftly_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.craftly_create_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.craftly_profiles (id, display_name, role)
  values (new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), 'Explorer'), 60),
    'user')
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.craftly_create_profile() from public, anon, authenticated;

drop trigger if exists craftly_auth_user_created on auth.users;
create trigger craftly_auth_user_created after insert on auth.users
for each row execute function public.craftly_create_profile();

-- Include accounts that were created before this script was installed.
insert into public.craftly_profiles (id, display_name, role)
select id, left(coalesce(nullif(btrim(raw_user_meta_data ->> 'name'), ''), 'Explorer'), 60), 'user'
from auth.users on conflict (id) do nothing;

-- Only a trusted database administrator can assign the admin role.
-- User-supplied signup metadata never controls this role.
create or replace function public.craftly_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.craftly_profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke all on function public.craftly_is_admin() from public, anon, authenticated;
grant execute on function public.craftly_is_admin() to authenticated;

create table if not exists public.craftly_mods (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 80),
  description text not null check (char_length(btrim(description)) between 15 and 5000),
  category text not null check (category in ('Add-ons', 'Textures', 'Worlds', 'Skins')),
  minecraft_version text not null check (minecraft_version ~ '^[0-9]+[.][0-9]+([.][0-9]+)?$'),
  editor_rating numeric(2,1) not null default 4.5 check (editor_rating between 1 and 5),
  cover_path text not null unique check (cover_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]+[.](png|jpg|jpeg|webp)$'),
  package_path text not null unique check (package_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]+[.](mcpack|mcaddon|mcworld)$'),
  file_size bigint not null check (file_size > 0 and file_size <= 52428800),
  published boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists craftly_mods_catalog_idx on public.craftly_mods (published, created_at desc);

create table if not exists public.craftly_favorites (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mod_id uuid not null references public.craftly_mods(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, mod_id)
);
create table if not exists public.craftly_ratings (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mod_id uuid not null references public.craftly_mods(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (user_id, mod_id)
);
create index if not exists craftly_ratings_mod_idx on public.craftly_ratings (mod_id);

-- One row per account/package: this counts unique download requests,
-- NOT proof of completed transfers or successful Minecraft imports.
create table if not exists public.craftly_downloads (
  user_id uuid not null references auth.users(id) on delete cascade,
  mod_id uuid not null references public.craftly_mods(id) on delete cascade,
  requested_at timestamptz not null default now(),
  primary key (user_id, mod_id)
);
create index if not exists craftly_downloads_mod_idx on public.craftly_downloads (mod_id);

alter table public.craftly_profiles enable row level security;
alter table public.craftly_mods enable row level security;
alter table public.craftly_favorites enable row level security;
alter table public.craftly_ratings enable row level security;
alter table public.craftly_downloads enable row level security;

-- Remove default API privileges and allow only the operations below.
revoke all on public.craftly_profiles, public.craftly_mods, public.craftly_favorites,
  public.craftly_ratings, public.craftly_downloads from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.craftly_mods to anon, authenticated;
grant insert, update, delete on public.craftly_mods to authenticated;
grant select on public.craftly_profiles to authenticated;
grant update (display_name) on public.craftly_profiles to authenticated;
grant select, insert, delete on public.craftly_favorites to authenticated;
grant select, insert, update, delete on public.craftly_ratings to authenticated;
grant select on public.craftly_downloads to authenticated;

-- Profiles: no client may insert a profile or update a role, even its own.
drop policy if exists craftly_profile_read on public.craftly_profiles;
create policy craftly_profile_read on public.craftly_profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.craftly_is_admin()));
drop policy if exists craftly_profile_name on public.craftly_profiles;
create policy craftly_profile_name on public.craftly_profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Guests see published catalog entries, never drafts.
drop policy if exists craftly_catalog_public on public.craftly_mods;
create policy craftly_catalog_public on public.craftly_mods for select to anon, authenticated
  using (published = true);
drop policy if exists craftly_catalog_admin on public.craftly_mods;
create policy craftly_catalog_admin on public.craftly_mods for all to authenticated
  using ((select public.craftly_is_admin())) with check ((select public.craftly_is_admin()));

-- Favorites and ratings are private per-account. Only aggregate ratings are public.
drop policy if exists craftly_favorites_read on public.craftly_favorites;
create policy craftly_favorites_read on public.craftly_favorites for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists craftly_favorites_add on public.craftly_favorites;
create policy craftly_favorites_add on public.craftly_favorites for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.craftly_mods m where m.id = mod_id and m.published));
drop policy if exists craftly_favorites_remove on public.craftly_favorites;
create policy craftly_favorites_remove on public.craftly_favorites for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists craftly_ratings_read on public.craftly_ratings;
create policy craftly_ratings_read on public.craftly_ratings for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists craftly_ratings_add on public.craftly_ratings;
create policy craftly_ratings_add on public.craftly_ratings for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.craftly_mods m where m.id = mod_id and m.published));
drop policy if exists craftly_ratings_update on public.craftly_ratings;
create policy craftly_ratings_update on public.craftly_ratings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.craftly_mods m where m.id = mod_id and m.published));
drop policy if exists craftly_ratings_remove on public.craftly_ratings;
create policy craftly_ratings_remove on public.craftly_ratings for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists craftly_downloads_read on public.craftly_downloads;
create policy craftly_downloads_read on public.craftly_downloads for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.craftly_record_download(p_mod_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not exists (select 1 from public.craftly_mods where id = p_mod_id and published) then
    raise exception 'Published mod not found';
  end if;
  insert into public.craftly_downloads(user_id, mod_id, requested_at)
    values (auth.uid(), p_mod_id, now())
    on conflict (user_id, mod_id) do update set requested_at = excluded.requested_at;
end;
$$;
revoke all on function public.craftly_record_download(uuid) from public, anon, authenticated;
grant execute on function public.craftly_record_download(uuid) to authenticated;

-- Deliberately return only aggregates, not identities or per-user history.
create or replace function public.craftly_mod_stats()
returns table (mod_id uuid, rating numeric, rating_count bigint, download_requests bigint)
language sql stable security definer set search_path = '' as $$
  select m.id,
    coalesce((select avg(r.rating)::numeric from public.craftly_ratings r where r.mod_id=m.id), m.editor_rating),
    (select count(*) from public.craftly_ratings r where r.mod_id=m.id),
    (select count(*) from public.craftly_downloads d where d.mod_id=m.id)
  from public.craftly_mods m where m.published;
$$;
revoke all on function public.craftly_mod_stats() from public, anon, authenticated;
grant execute on function public.craftly_mod_stats() to anon, authenticated;

-- Covers are public artwork. Packages are PRIVATE, downloaded via signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('craftly-covers', 'craftly-covers', true, 8388608, array['image/png','image/jpeg','image/webp']),
  ('craftly-packages', 'craftly-packages', false, 52428800, null)
on conflict (id) do update set
  public=excluded.public, file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- Supabase manages the storage schema privileges/RLS. Scope OUR policies to OUR buckets.
drop policy if exists craftly_storage_admin on storage.objects;
create policy craftly_storage_admin on storage.objects for all to authenticated
  using (bucket_id in ('craftly-covers','craftly-packages') and (select public.craftly_is_admin()))
  with check (
    (select public.craftly_is_admin()) and (
      (bucket_id='craftly-covers' and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]+[.](png|jpg|jpeg|webp)$')
      or
      (bucket_id='craftly-packages' and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]+[.](mcpack|mcaddon|mcworld)$')
    )
  );
drop policy if exists craftly_storage_covers_read on storage.objects;
create policy craftly_storage_covers_read on storage.objects for select to anon, authenticated
  using (bucket_id='craftly-covers');
drop policy if exists craftly_storage_packages_read on storage.objects;
create policy craftly_storage_packages_read on storage.objects for select to authenticated
  using (bucket_id='craftly-packages' and exists (
    select 1 from public.craftly_mods m where m.package_path = name and m.published
  ));

-- Ask PostgREST to discover the new tables and RPC functions.
notify pgrst, 'reload schema';
commit;

select 'Craftly setup complete. No admin account has been assigned yet.' as result;
