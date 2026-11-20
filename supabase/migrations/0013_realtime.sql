-- Sinkron langsung antar perangkat: perubahan tabel dikirim lewat Supabase Realtime.
-- Realtime menghormati RLS, jadi perangkat hanya menerima baris miliknya sendiri.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'accounts', 'categories', 'transactions', 'investments', 'bills', 'savings_goals', 'debts', 'sinking_funds',
    'semesters', 'courses', 'course_schedules', 'materials', 'tasks', 'task_work_slots', 'holidays',
    'research_projects', 'research_needs', 'research_targets', 'research_ideas', 'readings', 'supervisions',
    'events', 'settings'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
