-- Fungsi yang dipanggil aplikasi. Semuanya SECURITY INVOKER, jadi tetap tunduk pada RLS.

-- Dipanggil setelah login. Idempoten: aman dipanggil berulang.
-- Mengisi kategori bawaan (D-09) dan pengaturan default (SPEC 5.8).
create or replace function public.bootstrap_user()
returns void
language plpgsql
as $$
begin
  if auth.uid() is null then
    raise exception 'Harus login';
  end if;

  insert into public.categories (slug, name, kind, icon, color, keywords, sort_order, is_default)
  select v.slug, v.name, v.kind, v.icon, v.color, v.keywords, v.sort_order, true
  from (values
    ('o_makan', 'Makan & minum', 'expense', '🍜', '#d9822b', array['makan','minum','kopi','jajan','sarapan','lunch','dinner','snack','boba','warteg','galon','gofood','grabfood','nasi','ayam','bakso','mie']::text[], 0),
    ('o_transport', 'Transportasi', 'expense', '🚌', '#2f7fb8', array['bensin','ojol','gojek','grab','angkot','parkir','tol','kereta','krl','bus','transport','maxim','travel','tiket kereta']::text[], 1),
    ('o_kos', 'Kos & tempat tinggal', 'expense', '🏠', '#7a5ea8', array['kos','kontrakan','sewa kos','listrik','pln','wifi kos']::text[], 2),
    ('o_kuliah', 'Kuliah', 'expense', '🎓', '#0f7b6c', array['ukt','spp','buku','fotokopi','print','cetak','praktikum','kuliah','materai','jilid']::text[], 3),
    ('o_riset', 'Riset & lapangan', 'expense', '🛰️', '#2a9d8f', array['lapangan','survei','riset','drone','baterai','sewa alat','gnss','uav','patok','akomodasi lapangan']::text[], 4),
    ('o_org', 'Organisasi', 'expense', '🤝', '#c2528b', array['organisasi','himpunan','iuran','proker','rapat','konsumsi rapat','kas organisasi']::text[], 5),
    ('o_pulsa', 'Pulsa & internet', 'expense', '📶', '#4a6fa5', array['pulsa','kuota','internet','paket data','indihome']::text[], 6),
    ('o_langganan', 'Langganan', 'expense', '🔁', '#8a6d3b', array['langganan','subscribe','netflix','spotify','youtube','claude','chatgpt','cloud','domain','hosting']::text[], 7),
    ('o_harian', 'Kebutuhan harian', 'expense', '🧴', '#5f8f4e', array['sabun','sampo','laundry','deterjen','belanja','tisu','alfamart','indomaret','skincare','pasta gigi']::text[], 8),
    ('o_sehat', 'Kesehatan', 'expense', '💊', '#c0504d', array['obat','dokter','klinik','vitamin','apotek','bpjs','rumah sakit']::text[], 9),
    ('o_hibur', 'Hiburan', 'expense', '🎮', '#b8860b', array['nonton','game','bioskop','jalan','hangout','hiburan','konser']::text[], 10),
    ('o_hadiah', 'Hadiah & donasi', 'expense', '🎁', '#d46a6a', array['hadiah','kado','donasi','sedekah','infaq','zakat','amal']::text[], 11),
    ('o_admin', 'Biaya admin & pajak', 'expense', '🏷️', '#7d8590', array['biaya admin','pajak','denda']::text[], 12),
    ('o_lain', 'Lainnya', 'expense', '📦', '#8c9199', '{}'::text[], 13),
    ('i_saku', 'Uang saku atau kiriman', 'income', '💼', '#2f7fb8', array['uang saku','kiriman','transferan ortu','ortu','orang tua','saku']::text[], 0),
    ('i_gaji', 'Gaji, honor, atau upah magang', 'income', '💰', '#1f7a4d', array['gaji','honor','upah','magang']::text[], 1),
    ('i_beasiswa', 'Beasiswa', 'income', '🎓', '#0f7b6c', array['beasiswa','kip','bidikmisi']::text[], 2),
    ('i_proyek', 'Proyek atau freelance', 'income', '🛠️', '#7a5ea8', array['proyek','freelance','jasa','job']::text[], 3),
    ('i_invest', 'Hasil investasi', 'income', '📈', '#b8860b', array['dividen','bunga','profit','cuan','hasil investasi']::text[], 4),
    ('i_hadiah', 'Hadiah', 'income', '🎁', '#d46a6a', array['hadiah','kado','angpao','thr']::text[], 5),
    ('i_lain', 'Lainnya', 'income', '📦', '#8c9199', '{}'::text[], 6)
  ) as v(slug, name, kind, icon, color, keywords, sort_order)
  on conflict (user_id, slug) do nothing;

  insert into public.settings (key, value)
  values
    ('briefing_time', '"06:30"'),
    ('recap_time', '"21:00"'),
    ('quiet_hours', '["22:30", "06:00"]'),
    ('english_goal', '"academic_general"'),
    ('english_level', '"intermediate"'),
    ('english_daily_minutes', '15'),
    ('english_mode', 'false'),
    ('english_correction_level', '"important_only"'),
    ('timezone', '"Asia/Jakarta"'),
    ('agent_max_steps', '6')
  on conflict (user_id, key) do nothing;
end;
$$;

-- Impor cadangan app lama dalam SATU transaksi (D-05).
-- payload dibuat oleh lib/legacy/transform.ts:
--   tables: { <nama_tabel>: [baris dengan kolom yang sama] }
--   category_updates: [{ id, name, icon, color, keywords, subcategories, sort_order, is_hidden, monthly_budget }]
--   map: [{ source_table, legacy_id, new_id }]
--   log: { exported_at, file_sha256, summary }
-- Baris yang id-nya sudah ada dilewati, sehingga impor ulang tidak menggandakan data.
create or replace function public.import_legacy_backup(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  ordered text[] := array[
    'accounts', 'categories', 'semesters', 'courses', 'course_schedules', 'materials',
    'tasks', 'task_work_slots', 'holidays',
    'research_projects', 'research_needs', 'research_targets', 'research_ideas', 'readings', 'supervisions',
    'events', 'transactions', 'investments', 'bills', 'savings_goals', 'debts', 'sinking_funds',
    'agent_memory'
  ];
  t text;
  rows jsonb;
  cols text;
  n int;
  result jsonb := '{}';
  u jsonb;
begin
  if auth.uid() is null then
    raise exception 'Harus login';
  end if;

  for t in select jsonb_object_keys(coalesce(payload -> 'tables', '{}')) loop
    if not t = any(ordered) then
      raise exception 'Tabel % tidak boleh diimpor', t;
    end if;
  end loop;

  foreach t in array ordered loop
    rows := payload -> 'tables' -> t;
    if rows is null or jsonb_array_length(rows) = 0 then
      continue;
    end if;
    select string_agg(quote_ident(k), ', ' order by k)
      into cols
      from jsonb_object_keys(rows -> 0) as k
      where k not in ('user_id', 'created_at', 'updated_at', 'is_fulfilled');
    execute format(
      'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict (id) do nothing',
      t, cols, cols, t
    ) using rows;
    get diagnostics n = row_count;
    result := result || jsonb_build_object(t, n);
  end loop;

  for u in select * from jsonb_array_elements(coalesce(payload -> 'category_updates', '[]')) loop
    update public.categories c set
      name = coalesce(u ->> 'name', c.name),
      icon = coalesce(u ->> 'icon', c.icon),
      color = coalesce(u ->> 'color', c.color),
      keywords = coalesce(array(select jsonb_array_elements_text(u -> 'keywords')), c.keywords),
      subcategories = coalesce(array(select jsonb_array_elements_text(u -> 'subcategories')), c.subcategories),
      sort_order = coalesce((u ->> 'sort_order')::int, c.sort_order),
      is_hidden = coalesce((u ->> 'is_hidden')::boolean, c.is_hidden),
      monthly_budget = coalesce((u ->> 'monthly_budget')::bigint, c.monthly_budget)
    where c.id = (u ->> 'id')::uuid;
  end loop;

  insert into public.legacy_id_map (source_table, legacy_id, new_id)
  select m ->> 'source_table', m ->> 'legacy_id', (m ->> 'new_id')::uuid
  from jsonb_array_elements(coalesce(payload -> 'map', '[]')) as m
  on conflict (user_id, source_table, legacy_id) do nothing;

  insert into public.legacy_imports (exported_at, file_sha256, summary)
  values (
    (payload -> 'log' ->> 'exported_at')::timestamptz,
    coalesce(payload -> 'log' ->> 'file_sha256', ''),
    coalesce(payload -> 'log' -> 'summary', '{}') || jsonb_build_object('inserted', result)
  );

  return result;
end;
$$;

revoke execute on function public.bootstrap_user() from anon, public;
revoke execute on function public.import_legacy_backup(jsonb) from anon, public;
grant execute on function public.bootstrap_user() to authenticated;
grant execute on function public.import_legacy_backup(jsonb) to authenticated;
