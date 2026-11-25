'use client';
import { useActionState, useState } from 'react';
import { sendLoginCode, verifyLoginCode, type LoginState } from './actions';

const IDLE: LoginState = { status: 'idle', step: 'email' };

export function LoginForm() {
  const [sendState, send, sending] = useActionState<LoginState, FormData>(sendLoginCode, IDLE);
  const [verifyState, verify, verifying] = useActionState<LoginState, FormData>(verifyLoginCode, IDLE);
  // Kembali ke langkah email tanpa memuat ulang halaman.
  const [editing, setEditing] = useState(false);
  const [lastSent, setLastSent] = useState(sendState);

  if (sendState !== lastSent) {
    setLastSent(sendState);
    setEditing(false);
  }

  const onCode = sendState.step === 'code' && !editing;

  if (!onCode) {
    return (
      <form action={send} className="space-y-3">
        <label className="block">
          <span className="label">Email</span>
          <input
            name="email" type="email" required autoComplete="email" inputMode="email" className="input"
            placeholder="nama@contoh.com" defaultValue={sendState.email}
          />
        </label>
        <button type="submit" className="btn btn-primary w-full" disabled={sending}>
          {sending ? 'Mengirim...' : 'Kirim kode masuk'}
        </button>
        {sendState.message && (
          <p role="status" className={sendState.status === 'error' ? 'text-[13px] text-negative' : 'text-[13px] text-muted'}>
            {sendState.message}
          </p>
        )}
      </form>
    );
  }

  const message = verifyState.status === 'error' ? verifyState.message : sendState.message;
  return (
    <div className="space-y-3">
      <form action={verify} className="space-y-3">
        <input type="hidden" name="email" value={sendState.email} />
        <p className="text-[13px] text-muted">
          Kode dikirim ke <span className="font-semibold text-fg">{sendState.email}</span>.
        </p>
        <label className="block">
          <span className="label">Kode dari email</span>
          <input
            name="code" required autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9 ]{6,12}"
            maxLength={12} className="input text-center font-display text-[22px] font-bold tracking-[0.3em]" placeholder="000000"
          />
        </label>
        <button type="submit" className="btn btn-primary w-full" disabled={verifying}>
          {verifying ? 'Memeriksa...' : 'Masuk'}
        </button>
        {message && (
          <p role="status" className={verifyState.status === 'error' ? 'text-[13px] text-negative' : 'text-[13px] text-muted'}>
            {message}
          </p>
        )}
      </form>
      <div className="flex justify-between gap-2">
        <button type="button" className="min-h-11 px-1 text-[13px] font-semibold text-accent-strong disabled:opacity-50" onClick={() => setEditing(true)}>
          Ganti email
        </button>
        <form action={send}>
          <input type="hidden" name="email" value={sendState.email} />
          <button type="submit" className="min-h-11 px-1 text-[13px] font-semibold text-accent-strong disabled:opacity-50" disabled={sending}>
            {sending ? 'Mengirim...' : 'Kirim ulang kode'}
          </button>
        </form>
      </div>
    </div>
  );
}
