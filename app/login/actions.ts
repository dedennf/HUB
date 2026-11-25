'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { finishLogin } from '@/lib/auth-finish';
import { logAuthFailure } from '@/lib/auth-log';
import { isOwnerEmail } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export type LoginState = {
  status: 'idle' | 'sent' | 'error';
  /** Langkah form: minta email, atau isi kode yang dikirim ke email itu. */
  step: 'email' | 'code';
  email?: string;
  message?: string;
};

const emailSchema = z.email('Format email tidak valid.');
// Panjang kode mengikuti pengaturan Supabase (bawaan 6, bisa sampai 10 digit).
const codeSchema = z.string().regex(/^\d{6,10}$/, 'Kode terdiri dari 6 angka dari email.');

const SENT_MESSAGE = 'Kalau email itu terdaftar, kode masuk sudah dikirim. Cek kotak masuk dan folder spam.';

/** Kirim email masuk berisi kode 6 angka (dan tautan cadangan untuk browser). */
export async function sendLoginCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(String(formData.get('email') ?? '').trim());
  if (!parsed.success) return { status: 'error', step: 'email', message: parsed.error.issues[0].message };
  const email = parsed.data;

  const sent: LoginState = { status: 'sent', step: 'code', email, message: SENT_MESSAGE };
  // App satu pengguna: email lain tidak dikirimi apa pun, tapi tampilannya dibuat sama.
  if (!isOwnerEmail(email)) return sent;

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  const origin = process.env.NEXT_PUBLIC_SITE_URL || `${proto}://${host}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) {
    if (error.status === 429) {
      return { status: 'error', step: 'email', email, message: 'Terlalu sering meminta kode. Tunggu sekitar satu menit lalu coba lagi.' };
    }
    return { status: 'error', step: 'email', email, message: 'Gagal mengirim kode masuk. Coba lagi beberapa saat lagi.' };
  }
  return sent;
}

/** Cocokkan kode dari email. Berhasil berarti sesi tersimpan di cookie lalu pindah ke Beranda. */
export async function verifyLoginCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const token = String(formData.get('code') ?? '').replace(/\s+/g, '');
  const back = (message: string): LoginState => ({ status: 'error', step: 'code', email, message });

  if (!emailSchema.safeParse(email).success) return { status: 'error', step: 'email', message: 'Isi email dulu.' };
  const code = codeSchema.safeParse(token);
  if (!code.success) return back(code.error.issues[0].message);
  // Email lain tidak pernah dikirimi kode, jadi jawabannya sama dengan kode salah.
  if (!isOwnerEmail(email)) return back('Kode salah atau sudah kedaluwarsa. Minta kode baru.');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code.data, type: 'email' });
  if (error) {
    logAuthFailure('login-code', 'verifyOtp gagal', { status: error.status, code: error.code, message: error.message });
    if (error.status === 429) return back('Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.');
    return back('Kode salah atau sudah kedaluwarsa. Minta kode baru.');
  }
  const user = data.user ?? data.session?.user ?? null;
  if (!user) {
    logAuthFailure('login-code', 'verifikasi berhasil tetapi data user kosong');
    return back('Gagal masuk. Minta kode baru lalu coba lagi.');
  }

  const result = await finishLogin(supabase, user, 'login-code');
  if (result !== 'ok') redirect(`/login?error=${result}`);
  redirect('/');
}

/** Masuk dengan email dan kata sandi. Tidak butuh email sama sekali, cocok untuk app terpasang. */
export async function signInWithPassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const fail = (message: string): LoginState => ({ status: 'error', step: 'email', email, message });

  if (!emailSchema.safeParse(email).success) return fail('Format email tidak valid.');
  if (!password) return fail('Isi kata sandi.');
  // Pesan sama untuk email lain dan sandi salah supaya tidak bisa dipakai menebak.
  const wrong = 'Email atau kata sandi salah. Belum pernah membuat kata sandi? Masuk lewat kode atau tautan email dulu.';
  if (!isOwnerEmail(email)) return fail(wrong);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error) logAuthFailure('login-password', 'signInWithPassword gagal', { status: error.status, code: error.code, message: error.message });
    if (error?.status === 429) return fail('Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.');
    return fail(wrong);
  }

  const result = await finishLogin(supabase, data.user, 'login-password');
  if (result !== 'ok') redirect(`/login?error=${result}`);
  redirect('/');
}
