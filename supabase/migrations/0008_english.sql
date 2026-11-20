-- Bahasa Inggris (SPEC 5.7). Dipakai mulai Fase 7.

create table public.vocab (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  term text not null,
  meaning_id text,
  definition_en text,
  example text,
  part_of_speech text,
  source_type text check (source_type in ('manual', 'reading', 'mistake', 'agent')),
  source_ref uuid,
  ease numeric not null default 2.5,
  interval_days int not null default 0,
  repetitions int not null default 0,
  due_at timestamptz not null default now(),
  lapses int not null default 0
);
create index vocab_user_due_idx on public.vocab (user_id, due_at);

create table public.vocab_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  vocab_id uuid not null references public.vocab on delete cascade,
  grade int not null check (grade between 0 and 5)
);

create table public.writing_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  prompt text,
  original text not null,
  corrected text,
  feedback jsonb,
  kind text check (kind in ('free', 'summary', 'abstract', 'journal', 'english_mode'))
);

create table public.mistake_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  pattern text not null,
  example text,
  count int not null default 1,
  last_seen_at timestamptz,
  unique (user_id, pattern)
);

create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  kind text not null check (kind in ('review', 'reading', 'writing', 'speaking')),
  duration_seconds int,
  summary text,
  score jsonb
);
