'use server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { isOwnerEmail } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export type LoginState = { status: 'idle' | 'sent' | 'error'; message?: string };

const schema = z.object({ email: z.email('Format email tidak valid.') });

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ email: String(formData.get('email') ?? '').trim() });
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0].message };

  const sent: LoginState = { status: 'sent', message: 'Kalau email itu terdaftar, tautan masuk sudah dikirim. Cek kotak masuk dan folder spam.' };
  // App satu pengguna: email lain tidak dikirimi apa pun, tapi pesannya dibuat sama.
  if (!isOwnerEmail(parsed.data.email)) return sent;

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  const origin = process.env.NEXT_PUBLIC_SITE_URL || `${proto}://${host}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) {
    if (error.status === 429) return { status: 'error', message: 'Terlalu sering meminta tautan. Tunggu sebentar lalu coba lagi.' };
    return { status: 'error', message: 'Gagal mengirim tautan masuk. Coba lagi beberapa saat lagi.' };
  }
  return sent;
}
