-- Cadangan otomatis mingguan (ROADMAP Fase 9). Bucket privat `backups`, folder milik pengguna: <user_id>/kompas-YYYY-MM-DD.json.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 52428800, array['application/json'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "backups_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "backups_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "backups_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "backups_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text);
