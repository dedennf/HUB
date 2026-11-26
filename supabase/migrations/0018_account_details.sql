-- Detail akun (D-61): nomor rekening atau nomor e-wallet dan nama pemilik untuk disalin cepat,
-- plus domain logo opsional bila nama akun tidak dikenali otomatis.
alter table public.accounts
  add column if not exists account_number text check (account_number is null or char_length(account_number) <= 40),
  add column if not exists account_holder text check (account_holder is null or char_length(account_holder) <= 80),
  add column if not exists logo_domain text check (logo_domain is null or logo_domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$');
