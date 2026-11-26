'use client';
import { useActionState } from 'react';
import { saveAiLimit, type SaveState } from '../actions';

export function LimitForm({ limit }: { limit: number }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveAiLimit, { ok: false });
  return (
    <form action={action} className="flex flex-col gap-3">
      <label>
        <span className="label">Batas token per hari</span>
        <input name="ai_daily_token_limit" className="input num" inputMode="numeric" defaultValue={limit || ''} placeholder="Kosongkan untuk tanpa batas" />
      </label>
      <p className="text-[12px] text-muted">Bila tercapai, Ra memakai pengurai lokal dan fitur Bahasa menunggu sampai besok (00.00 WIB). Semua data tetap bisa diisi manual.</p>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan batas'}</button>
        {state.message && <span role="status" className={`text-[13px] ${state.ok ? 'text-positive' : 'text-negative'}`}>{state.message}</span>}
      </div>
    </form>
  );
}
