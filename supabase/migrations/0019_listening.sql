-- IELTS Listening (D-65): naskah, soal, dan audio hasil TTS Gemini.
-- Audio disimpan di bucket privat `listening`, folder milik pengguna: <user_id>/<set_id>.wav.
-- Kunci jawaban hanya dibaca server saat menilai, tidak dikirim ke browser sebelum pengguna menjawab.

create table public.listening_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  section int not null check (section in (1, 4)),
  title text not null,
  script jsonb not null,
  questions jsonb not null,
  audio_path text,
  duration_seconds int,
  best_score int,
  attempts int not null default 0
);
create index listening_sets_user_created_idx on public.listening_sets (user_id, created_at desc);

alter table public.listening_sets enable row level security;
create policy owner_all on public.listening_sets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger set_updated_at before update on public.listening_sets for each row execute function public.set_updated_at();
revoke all on public.listening_sets from anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listening', 'listening', false, 15728640, array['audio/wav'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "listening_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'listening' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "listening_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'listening' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "listening_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'listening' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "listening_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'listening' and (storage.foldername(name))[1] = auth.uid()::text);
