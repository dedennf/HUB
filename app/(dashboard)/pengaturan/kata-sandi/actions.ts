'use server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { logAuthFailure } from '@/lib/auth-log';
import { createClient } from '@/lib/supabase/server';

export type PasswordState = { status: 'idle' | 'saved' | 'error'; message?: string };

const schema = z
  .object({
    password: z.string().min(8, 'Kata sandi minimal 8 karakter.').max(72, 'Kata sandi maksimal 72 karakter.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Ulangi kata sandi yang sama.' });

/** Membuat atau mengganti kata sandi pemilik yang sedang login. */
export async function setPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  await requireUser();
  const parsed = schema.safeParse({ password: String(formData.get('password') ?? ''), confirm: String(formData.get('confirm') ?? '') });
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logAuthFailure('set-password', 'updateUser gagal', { status: error.status, code: error.code, message: error.message });
    if (error.code === 'same_password') return { status: 'error', message: 'Kata sandi baru sama dengan yang lama.' };
    if (error.code === 'weak_password') return { status: 'error', message: 'Kata sandi terlalu lemah. Pakai campuran huruf dan angka yang lebih panjang.' };
    if (error.code === 'reauthentication_needed') return { status: 'error', message: 'Supabase meminta login ulang. Keluar, masuk lagi, lalu langsung buat kata sandi.' };
    return { status: 'error', message: 'Gagal menyimpan kata sandi. Coba lagi.' };
  }
  return { status: 'saved', message: 'Kata sandi tersimpan. Sekarang kamu bisa masuk di app terpasang dengan email dan kata sandi ini.' };
}
