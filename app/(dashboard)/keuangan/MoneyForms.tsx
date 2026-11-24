'use client';
import { useActionState } from 'react';
import type { ActionState } from './money-actions';

type Option = { value: string; label: string };
type Act = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const Err = ({ s, k }: { s: ActionState; k: string }) => (s.fieldErrors?.[k] ? <span className="mt-1 block text-[12px] text-negative">{s.fieldErrors[k]}</span> : null);
const Msg = ({ s }: { s: ActionState }) => (s.message ? <span role={s.ok ? 'status' : 'alert'} className={`text-[13px] ${s.ok ? 'text-positive' : 'text-negative'}`}>{s.message}</span> : null);

/** Bayar tagihan dan cicilan utang memakai form yang sama: akun, nominal, tanggal. */
export function PaymentForm({ action, accounts, defaultAccount, defaultAmount, today, accountOptional, submitLabel }: {
  action: Act; accounts: Option[]; defaultAccount?: string | null; defaultAmount: number; today: string; accountOptional?: boolean; submitLabel: string;
}) {
  const [s, act, pending] = useActionState<ActionState, FormData>(action, { ok: false });
  return (
    <form action={act} className="grid gap-3 sm:grid-cols-2">
      <label>
        <span className="label">Nominal</span>
        <input name="amount" className="input num" inputMode="decimal" defaultValue={defaultAmount || ''} required />
        <Err s={s} k="amount" />
      </label>
      <label>
        <span className="label">Tanggal</span>
        <input name="date" type="date" className="input" defaultValue={today} required />
        <Err s={s} k="date" />
      </label>
      <label className="sm:col-span-2">
        <span className="label">{accountOptional ? 'Catat juga sebagai transaksi dari akun (opsional)' : 'Bayar dari akun'}</span>
        <select name="account_id" className="input" defaultValue={defaultAccount ?? ''}>
          {(accountOptional || !defaultAccount) && <option value="">{accountOptional ? 'Jangan catat transaksi' : 'Pilih akun'}</option>}
          {accounts.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <Err s={s} k="account_id" />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn btn-primary min-w-32" disabled={pending}>{pending ? 'Menyimpan...' : submitLabel}</button>
        <Msg s={s} />
      </div>
    </form>
  );
}

export function ReconcileForm({ action }: { action: Act }) {
  const [s, act, pending] = useActionState<ActionState, FormData>(action, { ok: false });
  return (
    <form action={act} className="flex flex-col gap-3">
      <label>
        <span className="label">Saldo yang tertera di aplikasi bank atau dompet</span>
        <input name="actual" className="input num" inputMode="decimal" placeholder="1.250.000" required />
        <Err s={s} k="actual" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Memeriksa...' : 'Cocokkan'}</button>
        <Msg s={s} />
      </div>
    </form>
  );
}
