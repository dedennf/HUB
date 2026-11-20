-- RLS di SEMUA tabel public: hanya pemilik baris (user_id = auth.uid()) yang bisa membaca dan menulis.
-- Sekaligus memasang pemicu updated_at di semua tabel.

do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    execute format(
      'create policy owner_all on public.%I for all to authenticated '
      'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t.relname
    );
    execute format(
      'create trigger set_updated_at before update on public.%I '
      'for each row execute function public.set_updated_at()',
      t.relname
    );
  end loop;
end;
$$;

-- Tamu (anon) tidak butuh akses ke tabel mana pun.
revoke all on all tables in schema public from anon;
