-- Saldo akun dipelihara di database (SPEC 5.1, D-07).
-- balance = opening_balance + pemasukan - pengeluaran - transfer keluar + transfer masuk.
-- Klien tidak bisa mengubah balance secara langsung.

create or replace function public.accounts_guard_balance()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.balance := new.opening_balance;
  elsif coalesce(current_setting('app.balance_write', true), 'off') <> 'on' then
    new.balance := old.balance + (new.opening_balance - old.opening_balance);
  end if;
  return new;
end;
$$;

create trigger accounts_guard_balance
before insert or update on public.accounts
for each row execute function public.accounts_guard_balance();

create or replace function public.adjust_account_balance(p_account uuid, p_delta bigint, p_strict boolean)
returns void
language plpgsql
as $$
declare
  n int;
begin
  if p_account is null or p_delta = 0 then
    return;
  end if;
  perform set_config('app.balance_write', 'on', true);
  update public.accounts set balance = balance + p_delta where id = p_account;
  get diagnostics n = row_count;
  perform set_config('app.balance_write', 'off', true);
  if n = 0 and p_strict then
    raise exception 'Akun % tidak ditemukan', p_account using errcode = 'foreign_key_violation';
  end if;
end;
$$;

create or replace function public.apply_transaction_effect(r public.transactions, p_sign int, p_strict boolean)
returns void
language plpgsql
as $$
begin
  if r.kind = 'income' then
    perform public.adjust_account_balance(r.account_id, p_sign * r.amount, p_strict);
  elsif r.kind = 'expense' then
    perform public.adjust_account_balance(r.account_id, -p_sign * r.amount, p_strict);
  else
    perform public.adjust_account_balance(r.account_id, -p_sign * r.amount, p_strict);
    perform public.adjust_account_balance(r.to_account_id, p_sign * r.amount, p_strict);
  end if;
end;
$$;

create or replace function public.transactions_maintain_balance()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    -- tidak ketat: saat seluruh data pengguna dihapus, akun bisa sudah lebih dulu terhapus
    perform public.apply_transaction_effect(old, -1, false);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.apply_transaction_effect(new, 1, true);
  end if;
  return null;
end;
$$;

create trigger transactions_maintain_balance
after insert or update or delete on public.transactions
for each row execute function public.transactions_maintain_balance();

-- Hitung ulang saldo dari nol untuk memeriksa konsistensi.
create or replace function public.compute_account_balance(p_account uuid)
returns bigint
language sql
stable
as $$
  select a.opening_balance
    + coalesce((select sum(case
        when t.kind = 'income' and t.account_id = a.id then t.amount
        when t.kind = 'expense' and t.account_id = a.id then -t.amount
        when t.kind = 'transfer' and t.account_id = a.id then -t.amount
        when t.kind = 'transfer' and t.to_account_id = a.id then t.amount
        else 0 end)
      from public.transactions t
      where t.account_id = a.id or t.to_account_id = a.id), 0)
  from public.accounts a
  where a.id = p_account;
$$;

create or replace function public.check_account_balances()
returns table (account_id uuid, name text, stored bigint, computed bigint)
language sql
stable
as $$
  select a.id, a.name, a.balance, public.compute_account_balance(a.id)
  from public.accounts a
  order by a.sort_order, a.name;
$$;
