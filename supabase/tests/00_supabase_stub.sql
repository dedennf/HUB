-- Tiruan minimal lingkungan Supabase untuk menguji migrasi di PostgreSQL biasa.
-- JANGAN dijalankan di proyek Supabase sungguhan.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Sengaja TANPA "alter default privileges ... grant ... to authenticated": proyek Supabase baru
-- bisa tidak otomatis membuka tabel baru ke Data API. Migrasi wajib memberi GRANT sendiri (0014).
-- Fungsi baru juga tidak otomatis bisa dijalankan siapa pun:
alter default privileges in schema public revoke execute on functions from public;
