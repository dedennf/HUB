'use client';
import { useActionState, useState } from 'react';
import type { FormState } from '@/lib/schemas';
import type { Account, Category } from '@/lib/types';
import { saveTransaction } from './actions';

type Initial = {
  id?: string; kind: 'expense' | 'income' | 'transfer'; amount?: number; account_id?: string; to_account_id?: string | null;
  category_id?: string | null; subcategory?: string | null; note?: string | null; date: string; time?: string;
};

const KINDS = [
  { v: 'expense', l: 'Pengeluaran' },
  { v: 'income', l: 'Pemasukan' },
  { v: 'transfer', l: 'Transfer' },
] as const;

export function TransactionForm({ accounts, categories, initial }: { accounts: Account[]; categories: Category[]; initial: Initial }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveTransaction, { ok: false });
  const [kind, setKind] = useState(initial.kind);
  const err = (k: string) => state.fieldErrors?.[k] && <span className="mt-1 block text-xs text-danger">{state.fieldErrors[k]}</span>;
  const cats = categories.filter((c) => !c.is_hidden && c.kind === (kind === 'income' ? 'income' : 'expense'));
  const active = accounts.filter((a) => !a.is_archived || a.id === initial.account_id || a.id === initial.to_account_id);

  if (!accounts.length) return <p className="text-sm text-muted">Tambahkan akun dulu sebelum mencatat transaksi.</p>;

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <fieldset className="flex gap-2 sm:col-span-2">
        <legend className="sr-only">Jenis transaksi</legend>
        {KINDS.map((k) => (
          <label key={k.v} className={`tab cursor-pointer ${kind === k.v ? 'border-accent bg-accent text-accent-ink' : ''}`}>
            <input type="radio" name="kind" value={k.v} checked={kind === k.v} onChange={() => setKind(k.v)} className="sr-only" />
            {k.l}
          </label>
        ))}
      </fieldset>
      <label>
        <span className="label">Nominal</span>
        <input name="amount" className="input" inputMode="decimal" placeholder="25rb" required defaultValue={initial.amount ?? ''} />
        {err('amount')}
      </label>
      <label>
        <span className="label">{kind === 'transfer' ? 'Dari akun' : 'Akun'}</span>
        <select name="account_id" className="input" defaultValue={initial.account_id ?? active[0]?.id}>
          {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {err('account_id')}
      </label>
      {kind === 'transfer' ? (
        <label>
          <span className="label">Ke akun</span>
          <select name="to_account_id" className="input" defaultValue={initial.to_account_id ?? ''}>
            <option value="">Pilih akun tujuan</option>
            {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {err('to_account_id')}
        </label>
      ) : (
        <label>
          <span className="label">Kategori</span>
          <select name="category_id" className="input" defaultValue={initial.category_id ?? ''}>
            <option value="">Tanpa kategori</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
          </select>
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Tanggal</span>
          <input name="date" type="date" className="input" required defaultValue={initial.date} />
          {err('date')}
        </label>
        <label>
          <span className="label">Jam (opsional)</span>
          <input name="time" type="time" className="input" defaultValue={initial.time ?? ''} />
        </label>
      </div>
      <label className="sm:col-span-2">
        <span className="label">Catatan</span>
        <input name="note" className="input" maxLength={500} defaultValue={initial.note ?? ''} />
      </label>
      {kind !== 'transfer' && initial.subcategory && <input type="hidden" name="subcategory" value={initial.subcategory} />}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan'}</button>
        {state.message && <span role="status" className={`text-sm ${state.ok ? 'text-positive' : 'text-danger'}`}>{state.message}</span>}
      </div>
    </form>
  );
}
