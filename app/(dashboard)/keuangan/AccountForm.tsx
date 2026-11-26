'use client';
import { useActionState } from 'react';
import type { FormState } from '@/lib/schemas';
import type { Account } from '@/lib/types';
import { saveAccount } from './actions';

const TYPES = [
  { v: 'bank', l: 'Rekening bank' },
  { v: 'ewallet', l: 'Dompet digital' },
  { v: 'cash', l: 'Uang tunai' },
  { v: 'investment', l: 'Akun investasi' },
];

export function AccountForm({ account }: { account?: Account }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAccount, { ok: false });
  const err = (k: string) => state.fieldErrors?.[k] && <span className="mt-1 block text-[12px] text-negative">{state.fieldErrors[k]}</span>;
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {account && <input type="hidden" name="id" value={account.id} />}
      <label>
        <span className="label">Nama akun</span>
        <input name="name" className="input" required maxLength={60} defaultValue={account?.name} placeholder="BCA, GoPay, Tunai" />
        {err('name')}
      </label>
      <label>
        <span className="label">Jenis</span>
        <select name="type" className="input" defaultValue={account?.type ?? 'bank'}>
          {TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
      </label>
      <label>
        <span className="label">Saldo awal</span>
        <input name="opening_balance" className="input num" inputMode="decimal" defaultValue={account?.opening_balance ?? ''} placeholder="0" />
        <span className="mt-1 block text-[12px] text-muted">Saldo sekarang dihitung otomatis dari saldo awal dan semua transaksi.</span>
        {err('opening_balance')}
      </label>
      <label>
        <span className="label">Nama lain (pisahkan dengan koma)</span>
        <input name="aliases" className="input" defaultValue={account?.aliases.join(', ')} placeholder="atm biru, rekening utama" />
      </label>
      <label>
        <span className="label">Nomor rekening atau nomor HP e-wallet</span>
        <input name="account_number" className="input num" inputMode="numeric" maxLength={40} defaultValue={account?.account_number ?? ''} placeholder="1234567890" />
        <span className="mt-1 block text-[12px] text-muted">Opsional. Muncul dengan tombol Salin saat ada yang minta nomor rekening.</span>
        {err('account_number')}
      </label>
      <label>
        <span className="label">Atas nama</span>
        <input name="account_holder" className="input" maxLength={80} defaultValue={account?.account_holder ?? ''} placeholder="Nama di rekening" />
      </label>
      <label className="sm:col-span-2">
        <span className="label">Situs untuk logo (opsional)</span>
        <input name="logo_domain" className="input" maxLength={80} defaultValue={account?.logo_domain ?? ''} placeholder="Kosongkan, logo BCA, GoPay, dll. dikenali otomatis" />
        <span className="mt-1 block text-[12px] text-muted">Isi bila logo tidak muncul, mis. bankraya.co.id.</span>
        {err('logo_domain')}
      </label>
      {account && (
        <label className="flex min-h-11 items-center gap-2 text-[14px] sm:col-span-2">
          <input type="checkbox" name="is_archived" defaultChecked={account.is_archived} className="h-5 w-5 accent-[var(--accent)]" /> Arsipkan (sembunyikan dari pilihan)
        </label>
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan akun'}</button>
        {state.message && <span role="status" className={`text-[13px] ${state.ok ? 'text-positive' : 'text-negative'}`}>{state.message}</span>}
      </div>
    </form>
  );
}
