-- Fondasi: ekstensi dan fungsi bantu yang dipakai semua tabel.
-- Setiap tabel data punya: id uuid, user_id (default auth.uid()), created_at, updated_at.
-- RLS dan pemicu updated_at dipasang massal di 0010_rls.sql.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
