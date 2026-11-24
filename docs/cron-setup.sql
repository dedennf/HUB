-- Penjadwal Kompas (SPEC 8.3): pg_cron memanggil /api/cron/tick tiap 5 menit lewat pg_net.
-- Jalankan SEKALI di Supabase: Dashboard → SQL Editor → New query. Aman dijalankan ulang.
-- Ganti dua nilai di bawah sebelum menjalankan. Nilai rahasia disimpan di Supabase Vault, bukan di kode.
--   <URL_APP>      : alamat app tanpa garis miring di akhir, mis. https://dnfhub.vercel.app
--   <CRON_SECRET>  : isi yang sama persis dengan variabel CRON_SECRET di Vercel

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- simpan atau perbarui rahasia di Vault
do $$
declare
  v_url text := '<URL_APP>/api/cron/tick';
  v_secret text := '<CRON_SECRET>';
begin
  if exists (select 1 from vault.secrets where name = 'kompas_tick_url') then
    perform vault.update_secret((select id from vault.secrets where name = 'kompas_tick_url'), v_url);
  else
    perform vault.create_secret(v_url, 'kompas_tick_url');
  end if;
  if exists (select 1 from vault.secrets where name = 'kompas_cron_secret') then
    perform vault.update_secret((select id from vault.secrets where name = 'kompas_cron_secret'), v_secret);
  else
    perform vault.create_secret(v_secret, 'kompas_cron_secret');
  end if;
end;
$$;

-- jadwal tiap 5 menit (cron.schedule dengan nama yang sama menimpa jadwal lama)
select cron.schedule(
  'kompas-tick',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'kompas_tick_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'kompas_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $job$
);

-- Cek: jadwal terpasang dan hasil panggilan terakhir (status_code 200 = berhasil)
-- select jobname, schedule, active from cron.job;
-- select status_code, left(content, 200), created from net._http_response order by created desc limit 5;
-- Mematikan: select cron.unschedule('kompas-tick');
