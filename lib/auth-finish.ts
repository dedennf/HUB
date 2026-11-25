import type { SupabaseClient, User } from '@supabase/supabase-js';
import { logAuthFailure, maskEmail } from '@/lib/auth-log';
import { isOwnerEmail } from '@/lib/env';

export type FinishResult = 'ok' | 'not_owner' | 'config';

/**
 * Langkah terakhir login, dipakai tautan (/auth/confirm) dan kode OTP (server action).
 * Memastikan yang masuk adalah pemilik, lalu menyiapkan data bawaan.
 */
export async function finishLogin(supabase: SupabaseClient, user: User, where: string): Promise<FinishResult> {
  let owner: boolean;
  try {
    owner = isOwnerEmail(user.email);
  } catch (e) {
    logAuthFailure(where, 'OWNER_EMAIL tidak bisa dibaca', { message: (e as Error).message });
    await supabase.auth.signOut();
    return 'config';
  }
  if (!owner) {
    logAuthFailure(where, 'email bukan pemilik', {
      email: maskEmail(user.email),
      owner: maskEmail(process.env.OWNER_EMAIL?.trim()),
      ownerLength: process.env.OWNER_EMAIL?.length ?? 0,
    });
    await supabase.auth.signOut();
    return 'not_owner';
  }

  // Kategori bawaan dan pengaturan default (idempoten). Gagal di sini tidak menghalangi login.
  const { error: bootError } = await supabase.rpc('bootstrap_user');
  if (bootError) logAuthFailure(where, 'bootstrap_user gagal', { code: bootError.code, message: bootError.message });
  return 'ok';
}
