-- Meteran pemakaian Gemini (ROADMAP Fase 9). Satu baris per panggilan generateContent.
-- Token diambil dari usageMetadata respons Gemini. Isi prompt tidak disimpan.

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  feature text not null,                       -- agent | receipt | english | english_tts | automation | diagnose
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  total_tokens int not null default 0,
  ok boolean not null default true
);
create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;
create policy owner_all on public.ai_usage for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.ai_usage from anon;
