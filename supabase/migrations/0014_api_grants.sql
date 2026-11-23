-- Hak akses eksplisit untuk role API Supabase.
-- Proyek Supabase baru bisa tidak otomatis memberi role `authenticated` akses ke tabel dan fungsi baru
-- (pengaturan Data API). Tanpa GRANT, setiap query gagal dengan "permission denied for table ...".
-- Pembatasan per baris tetap dijaga RLS (0010): GRANT hanya membuka pintu, RLS memilih barisnya.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

-- Fungsi yang dipanggil aplikasi lewat RPC atau dari dalam pemicu.
grant execute on all functions in schema public to authenticated, service_role;
-- bootstrap_user dan import_legacy_backup tetap tertutup untuk tamu (lihat 0012).
revoke execute on all functions in schema public from anon;

-- Tabel dan fungsi dari migrasi berikutnya otomatis ikut.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant execute on functions to authenticated, service_role;

-- Tamu (anon) tetap tidak punya akses ke tabel mana pun.
revoke all on all tables in schema public from anon;
