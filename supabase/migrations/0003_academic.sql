-- Kuliah (SPEC 5.2 + tambahan D-08)

create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  number int,
  start_date date,
  end_date date,
  is_active boolean not null default false,
  check (end_date is null or start_date is null or end_date >= start_date)
);
create unique index semesters_one_active on public.semesters (user_id) where is_active;

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  semester_id uuid references public.semesters on delete set null,
  code text,
  name text not null,
  alias text,
  lecturer text,
  credits int check (credits is null or credits >= 0),
  room text,
  note text
);

create table public.course_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  course_id uuid not null references public.courses on delete cascade,
  weekday int not null check (weekday between 1 and 7),   -- 1 = Senin ... 7 = Minggu
  start_time time not null,
  end_time time not null,
  location text
);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  course_id uuid references public.courses on delete set null,
  title text not null,
  url text,
  storage_path text,
  notes text,
  meeting int,
  kind text,
  tags text[] not null default '{}'
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  course_id uuid references public.courses on delete set null,
  parent_id uuid references public.tasks on delete cascade,
  title text not null,
  description text,
  kind text not null default 'assignment' check (kind in ('assignment', 'exam', 'quiz', 'practicum')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  url text,
  due_at timestamptz,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'overdue')),
  estimated_minutes int,
  completed_at timestamptz
);
create index tasks_user_due_idx on public.tasks (user_id, due_at);

create table public.task_work_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  task_id uuid not null references public.tasks on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  suggested_by_agent boolean not null default false,
  check (end_at > start_at)
);

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  start_date date not null,
  end_date date,
  check (end_date is null or end_date >= start_date)
);
