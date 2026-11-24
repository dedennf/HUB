'use client';
import { useActionState } from 'react';
import { saveProfile, type SaveState } from '../actions';

export function ProfileForm({ name, program }: { name: string; program: string }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveProfile, { ok: false });
  return (
    <form action={action} className="flex flex-col gap-3">
      <label><span className="label">Nama panggilan</span><input name="profile_name" className="input" maxLength={40} defaultValue={name} placeholder="Dipakai di sapaan Beranda" /></label>
      <label><span className="label">Program studi atau kampus</span><input name="profile_program" className="input" maxLength={60} defaultValue={program} placeholder="Opsional" /></label>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan profil'}</button>
        {state.message && <span role="status" className={`text-[13px] ${state.ok ? 'text-positive' : 'text-negative'}`}>{state.message}</span>}
      </div>
    </form>
  );
}
