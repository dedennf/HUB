'use client';
import { useActionState } from 'react';
import { sendMagicLink, type LoginState } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: 'idle' });
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="label">Email</span>
        <input name="email" type="email" required autoComplete="email" inputMode="email" className="input" placeholder="nama@contoh.com" />
      </label>
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? 'Mengirim...' : 'Kirim tautan masuk'}
      </button>
      {state.message && (
        <p role="status" className={state.status === 'error' ? 'text-[13px] text-negative' : 'text-[13px] text-muted'}>{state.message}</p>
      )}
    </form>
  );
}
