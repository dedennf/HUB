-- Agen (SPEC 5.5). Dipakai mulai Fase 3, dibuat sekarang sesuai kriteria Fase 1.

create table public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  kind text not null check (kind in ('alias', 'merchant_rule', 'habit', 'preference', 'correction')),
  key text not null,
  value jsonb not null,
  confidence numeric not null default 1,
  last_used_at timestamptz
);
create index agent_memory_user_kind_idx on public.agent_memory (user_id, kind);

create table public.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  title text,
  channel text check (channel in ('text', 'voice', 'receipt'))
);

create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  conversation_id uuid not null references public.agent_conversations on delete cascade,
  role text not null check (role in ('user', 'model', 'tool')),
  content jsonb not null
);

create table public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  conversation_id uuid references public.agent_conversations on delete set null,
  tool_name text not null,
  args jsonb not null,
  summary text not null,
  status text not null default 'proposed'
    check (status in ('proposed', 'executed', 'rejected', 'undone', 'failed')),
  permission text not null check (permission in ('write', 'destructive')),
  result jsonb,
  undo_payload jsonb,
  executed_at timestamptz
);
create index agent_actions_user_status_idx on public.agent_actions (user_id, status);
