'use client';
import { useActionState } from 'react';
import { setPassword, type PasswordState } from './actions';

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(setPassword, { status: 'idle' });
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="label">Kata sandi baru</span>
        <input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="input" />
      </label>
      <label className="block">
        <span className="label">Ulangi kata sandi</span>
        <input name="confirm" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="input" />
      </label>
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan kata sandi'}</button>
      {state.message && (
        <p role="status" className={state.status === 'error' ? 'text-[13px] text-negative' : 'text-[13px] text-positive'}>{state.message}</p>
      )}
    </form>
  );
}
