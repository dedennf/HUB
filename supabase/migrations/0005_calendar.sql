-- Kalender (SPEC 5.4). Kalender gabungan dibangun di server oleh lib/calendar.ts
-- (getCalendarItems), bukan view, karena kuliah dan acara berulang perlu diekspansi.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz,
  is_all_day boolean not null default false,
  location text,
  recurrence text not null default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  recurrence_until date,
  notes text,
  check (end_at is null or end_at >= start_at)
);
create index events_user_start_idx on public.events (user_id, start_at);
