-- Uji migrasi: RLS, saldo otomatis, bootstrap, impor. Gagal = exception.
\set ON_ERROR_STOP on
insert into auth.users values ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
                              ('22222222-2222-2222-2222-222222222222', 'b@example.com');

-- Semua tabel public wajib RLS aktif.
do $$ begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) then
    raise exception 'Ada tabel tanpa RLS';
  end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select public.bootstrap_user();
select public.bootstrap_user();  -- idempoten
do $$ begin
  if (select count(*) from public.categories) <> 21 then raise exception 'kategori bawaan harus 21'; end if;
  if (select count(*) from public.settings) <> 10 then raise exception 'settings default harus 10'; end if;
end $$;

insert into public.accounts (id, name, type, opening_balance, balance)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'BCA', 'bank', 1000000, 999),
       ('aaaaaaaa-0000-0000-0000-000000000002', 'Dana', 'ewallet', 0, 0);
-- balance dari klien diabaikan, diisi opening_balance
do $$ begin
  if (select balance from public.accounts where name = 'BCA') <> 1000000 then raise exception 'balance awal salah'; end if;
end $$;

insert into public.transactions (id, kind, amount, account_id, occurred_at)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'expense', 30000, 'aaaaaaaa-0000-0000-0000-000000000001', now());
insert into public.transactions (kind, amount, account_id, to_account_id, occurred_at)
values ('transfer', 500000, 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', now());
update public.transactions set amount = 25000 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
update public.accounts set balance = 1 where name = 'Dana';            -- harus diabaikan
update public.accounts set opening_balance = 1100000 where name = 'BCA';
do $$ begin
  if (select balance from public.accounts where name = 'BCA') <> 1100000 - 25000 - 500000 then raise exception 'saldo BCA salah'; end if;
  if (select balance from public.accounts where name = 'Dana') <> 500000 then raise exception 'saldo Dana salah'; end if;
  if exists (select 1 from public.check_account_balances() where stored <> computed) then raise exception 'saldo tidak konsisten'; end if;
end $$;
delete from public.transactions where id = 'bbbbbbbb-0000-0000-0000-000000000001';
do $$ begin
  if (select balance from public.accounts where name = 'BCA') <> 600000 then raise exception 'saldo setelah hapus salah'; end if;
end $$;

-- Transfer ke akun sendiri ditolak, nominal nol ditolak
do $$ begin
  begin
    insert into public.transactions (kind, amount, account_id, to_account_id, occurred_at)
    values ('transfer', 1, 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', now());
    raise exception 'transfer ke akun sama seharusnya ditolak';
  exception when check_violation then null; end;
  begin
    insert into public.transactions (kind, amount, account_id, occurred_at)
    values ('expense', 0, 'aaaaaaaa-0000-0000-0000-000000000001', now());
    raise exception 'nominal nol seharusnya ditolak';
  exception when check_violation then null; end;
end $$;

-- Pengguna B tidak bisa melihat atau memakai akun A
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  if (select count(*) from public.accounts) <> 0 then raise exception 'RLS bocor: B melihat akun A'; end if;
  if (select count(*) from public.transactions) <> 0 then raise exception 'RLS bocor: B melihat transaksi A'; end if;
  begin
    insert into public.transactions (kind, amount, account_id, occurred_at)
    values ('income', 5, 'aaaaaaaa-0000-0000-0000-000000000001', now());
    raise exception 'B berhasil memakai akun A';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.accounts (user_id, name, type) values ('11111111-1111-1111-1111-111111111111', 'X', 'bank');
    raise exception 'B berhasil menulis atas nama A';
  exception when insufficient_privilege then null; end;
end $$;

-- anon tidak punya akses
reset role;
set role anon;
do $$ begin
  begin
    perform 1 from public.accounts;
    raise exception 'anon bisa membaca accounts';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'SEMUA UJI LOLOS' as hasil;
