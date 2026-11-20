-- Otomasi dan notifikasi (SPEC 5.6, 8.2). Dipakai mulai Fase 6.

create table public.automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  is_enabled boolean not null default true,
  is_system boolean not null default false,
  trigger jsonb not null,
  conditions jsonb not null default '[]',
  action jsonb not null,
  mode text not null check (mode in ('rule', 'agent')),
  auto_write boolean not null default false,
  last_run_at timestamptz,
  next_run_at timestamptz
);
create index automations_next_run_idx on public.automations (next_run_at) where is_enabled;

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  automation_id uuid not null references public.automations on delete cascade,
  status text not null check (status in ('success', 'skipped', 'failed')),
  output jsonb,
  error text
);

create table public.automation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  event text not null,
  payload jsonb not null default '{}',
  processed_at timestamptz
);
create index automation_events_pending_idx on public.automation_events (created_at) where processed_at is null;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  endpoint text unique not null,
  keys jsonb not null,
  device_label text
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  title text not null,
  body text,
  url text,
  category text check (category in ('briefing', 'deadline', 'bill', 'budget', 'english', 'research')),
  sent_at timestamptz,
  read_at timestamptz
);
