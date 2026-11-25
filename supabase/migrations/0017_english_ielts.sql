-- Bahasa Inggris v2: persiapan IELTS (D-60). Sesi harian, kemajuan grammar, dan jenis latihan bergaya tes.

-- Satu baris per hari: kata baru, materi grammar, skill tes hari itu, dan langkah yang sudah selesai.
-- Konten dari Gemini disimpan di sini supaya membuka ulang sesi tidak memanggil Gemini lagi.
create table public.english_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  day date not null,
  words jsonb not null default '[]'::jsonb,
  grammar_key text,
  grammar jsonb,
  grammar_score int check (grammar_score between 0 and 10),
  skill text not null,
  done jsonb not null default '{}'::jsonb,
  unique (user_id, day)
);

-- Kemajuan per topik grammar. Topik dianggap dikuasai bila skor terbaik >= 4 dari 5.
create table public.grammar_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  topic_key text not null,
  attempts int not null default 0,
  best_score int not null default 0,
  last_score int not null default 0,
  last_at timestamptz,
  unique (user_id, topic_key)
);

do $$
declare
  t text;
begin
  foreach t in array array['english_days', 'grammar_progress'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy owner_all on public.%I for all to authenticated '
      'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- Jenis baru: tulisan IELTS Task 1 dan 2, latihan grammar dan reading, kata dari sesi harian.
alter table public.writing_submissions drop constraint if exists writing_submissions_kind_check;
alter table public.writing_submissions add constraint writing_submissions_kind_check
  check (kind in ('free', 'summary', 'abstract', 'journal', 'english_mode', 'ielts_task1', 'ielts_task2'));

alter table public.practice_sessions drop constraint if exists practice_sessions_kind_check;
alter table public.practice_sessions add constraint practice_sessions_kind_check
  check (kind in ('review', 'reading', 'writing', 'speaking', 'grammar', 'listening'));

alter table public.vocab drop constraint if exists vocab_source_type_check;
alter table public.vocab add constraint vocab_source_type_check
  check (source_type in ('manual', 'reading', 'mistake', 'agent', 'daily'));
