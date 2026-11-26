-- Pemulihan dari cadangan Kompas (D-34, ROADMAP Fase 9).
-- Hanya MENAMBAH baris yang hilang (cocok lewat id). Tidak pernah menimpa atau menghapus data yang ada.
-- Baris yang bentrok dengan aturan unik (mis. pengaturan yang sudah ada) dilewati.
-- Pemetaan kategori bawaan (slug) dan semester aktif disiapkan server sebelum memanggil fungsi ini.

create or replace function public.restore_kompas_backup(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  ordered text[] := array[
    'accounts', 'categories', 'semesters', 'courses', 'course_schedules', 'materials',
    'tasks', 'task_work_slots', 'holidays',
    'research_projects', 'research_needs', 'research_targets', 'research_ideas', 'readings', 'supervisions',
    'events', 'transactions', 'investments', 'bills', 'savings_goals', 'debts', 'sinking_funds',
    'settings', 'agent_memory', 'automations',
    'vocab', 'vocab_reviews', 'writing_submissions', 'mistake_patterns', 'practice_sessions'
  ];
  t text;
  rows jsonb;
  cols text;
  n int;
  result jsonb := '{}';
begin
  if auth.uid() is null then
    raise exception 'Harus login';
  end if;

  for t in select jsonb_object_keys(coalesce(payload -> 'tables', '{}')) loop
    if not t = any(ordered) then
      raise exception 'Tabel % tidak boleh dipulihkan', t;
    end if;
  end loop;

  foreach t in array ordered loop
    rows := payload -> 'tables' -> t;
    if rows is null or jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) = 0 then
      continue;
    end if;
    -- hanya kolom yang ada di tabel sekarang (cadangan bisa dari versi skema lain), tanpa kolom terhitung dan pemilik
    select string_agg(quote_ident(c.column_name), ', ' order by c.column_name)
      into cols
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = t
        and c.is_generated = 'NEVER'
        and c.column_name not in ('user_id', 'updated_at')
        and exists (select 1 from jsonb_array_elements(rows) r where r ? c.column_name);
    if cols is null then
      continue;
    end if;
    execute format(
      'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing',
      t, cols, cols, t
    ) using rows;
    get diagnostics n = row_count;
    result := result || jsonb_build_object(t, n);
  end loop;

  -- data lama yang dipulihkan bukan peristiwa baru: jangan memicu saran slot, peringatan budget, atau deteksi janggal
  delete from public.automation_events where user_id = auth.uid() and created_at = now();

  return result;
end;
$$;

revoke execute on function public.restore_kompas_backup(jsonb) from anon, public;
grant execute on function public.restore_kompas_backup(jsonb) to authenticated;
