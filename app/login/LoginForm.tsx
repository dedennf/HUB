'use client';
import { useActionState, useState } from 'react';
import { sendLoginCode, signInWithPassword, verifyLoginCode, type LoginState } from './actions';

const IDLE: LoginState = { status: 'idle', step: 'email' };
const linkButton = 'min-h-11 px-1 text-[13px] font-semibold text-accent-strong disabled:opacity-50';

function Status({ state }: { state: LoginState }) {
  if (!state.message) return null;
  return (
    <p role="status" className={state.status === 'error' ? 'text-[13px] text-negative' : 'text-[13px] text-muted'}>
      {state.message}
    </p>
  );
}

/** Mode bawaan: email dan kata sandi. Tidak bergantung pada email masuk, jadi jalan di app terpasang. */
function PasswordLogin({ onEmailMode }: { onEmailMode: () => void }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signInWithPassword, IDLE);
  return (
    <div className="space-y-3">
      <form action={action} className="space-y-3">
        <label className="block">
          <span className="label">Email</span>
          <input
            name="email" type="email" required autoComplete="email" inputMode="email" className="input"
            placeholder="nama@contoh.com" defaultValue={state.email}
          />
        </label>
        <label className="block">
          <span className="label">Kata sandi</span>
          <input name="password" type="password" required autoComplete="current-password" className="input" />
        </label>
        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? 'Memeriksa...' : 'Masuk'}
        </button>
        <Status state={state} />
      </form>
      <button type="button" className={linkButton} onClick={onEmailMode}>
        Belum punya kata sandi? Masuk lewat email
      </button>
    </div>
  );
}

/** Cadangan: kode atau tautan dari email. Dipakai sekali untuk membuat kata sandi. */
function EmailLogin({ onPasswordMode }: { onPasswordMode: () => void }) {
  const [sendState, send, sending] = useActionState<LoginState, FormData>(sendLoginCode, IDLE);
  const [verifyState, verify, verifying] = useActionState<LoginState, FormData>(verifyLoginCode, IDLE);
  const [editing, setEditing] = useState(false);
  const [lastSent, setLastSent] = useState(sendState);

  if (sendState !== lastSent) {
    setLastSent(sendState);
    setEditing(false);
  }

  if (sendState.step !== 'code' || editing) {
    return (
      <div className="space-y-3">
        <form action={send} className="space-y-3">
          <label className="block">
            <span className="label">Email</span>
            <input
              name="email" type="email" required autoComplete="email" inputMode="email" className="input"
              placeholder="nama@contoh.com" defaultValue={sendState.email}
            />
          </label>
          <button type="submit" className="btn btn-primary w-full" disabled={sending}>
            {sending ? 'Mengirim...' : 'Kirim email masuk'}
          </button>
          <Status state={sendState} />
        </form>
        <button type="button" className={linkButton} onClick={onPasswordMode}>Masuk dengan kata sandi</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <form action={verify} className="space-y-3">
        <input type="hidden" name="email" value={sendState.email} />
        <p className="text-[13px] text-muted">
          Email dikirim ke <span className="font-semibold text-fg">{sendState.email}</span>. Kalau isinya kode angka, ketik di bawah.
          Kalau isinya hanya tautan, buka tautan itu di browser, lalu buat kata sandi di Pengaturan.
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
        <Status state={verifyState.status === 'error' ? verifyState : sendState} />
      </form>
      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" className={linkButton} onClick={() => setEditing(true)}>Ganti email</button>
        <form action={send}>
          <input type="hidden" name="email" value={sendState.email} />
          <button type="submit" className={linkButton} disabled={sending}>{sending ? 'Mengirim...' : 'Kirim ulang'}</button>
        </form>
      </div>
      <button type="button" className={linkButton} onClick={onPasswordMode}>Masuk dengan kata sandi</button>
    </div>
  );
}

export function LoginForm() {
  const [mode, setMode] = useState<'password' | 'email'>('password');
  return mode === 'password'
    ? <PasswordLogin onEmailMode={() => setMode('email')} />
    : <EmailLogin onPasswordMode={() => setMode('password')} />;
}
