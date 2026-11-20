-- Riset (SPEC 5.3 + tambahan D-08)

create table public.research_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  title text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'paused', 'done'))
);

create table public.research_needs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  project_id uuid references public.research_projects on delete cascade,
  item text not null,
  kind text,                                   -- data | alat | izin | akses | literatur | lainnya
  status text not null default 'open' check (status in ('open', 'in_progress', 'fulfilled')),
  is_fulfilled boolean generated always as (status = 'fulfilled') stored,
  note text
);

create table public.research_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  project_id uuid references public.research_projects on delete cascade,
  title text not null,
  due_date date,
  progress int not null default 0 check (progress between 0 and 100),
  last_touched_at timestamptz,
  note text
);

create table public.research_ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  project_id uuid references public.research_projects on delete set null,
  content text not null,
  source text,
  status text not null default 'raw' check (status in ('raw', 'viable', 'discarded')),
  note text
);

create table public.readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  project_id uuid references public.research_projects on delete set null,
  title text not null,
  authors text,
  year int,
  venue text,
  doi text,
  url text,
  collection text,
  tags text[] not null default '{}',
  claim text,
  verification_status text not null default 'unchecked'
    check (verification_status in ('unchecked', 'doi_checked', 'page_checked', 'fulltext_read')),
  inclusion text check (inclusion in ('use', 'maybe', 'exclude')),
  linked_target_ids uuid[] not null default '{}',
  linked_idea_ids uuid[] not null default '{}',
  content_excerpt text,
  notes text
);

create table public.supervisions (                  -- bimbingan
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  met_on date,
  supervisor text,
  points text,
  status text not null default 'open' check (status in ('open', 'done')),
  next_on date
);
