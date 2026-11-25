import type { EmailOtpType, User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { logAuthFailure, maskEmail } from '@/lib/auth-log';
import { isOwnerEmail } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

const OTP_TYPES: EmailOtpType[] = ['email', 'magiclink', 'signup', 'invite', 'recovery', 'email_change'];

/**
 * Tujuan tautan masuk. Mendukung dua bentuk:
 * - ?token_hash=...&type=email (template email yang disarankan, bisa dibuka di perangkat lain)
 * - ?code=... (template bawaan Supabase, harus dibuka di browser yang sama)
 *
 * Email pengguna diambil dari hasil verifyOtp / exchangeCodeForSession, bukan getClaims().
 * getClaims() memverifikasi ulang token (JWKS atau getUser) dan bisa gagal tepat setelah login,
 * yang dulu membuat pemilik dianggap bukan pemilik.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));

  const supabase = await createClient();
  let user: User | null = null;

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      logAuthFailure('confirm', 'verifyOtp gagal', { type, status: error.status, code: error.code, message: error.message });
      return to('/login?error=link');
    }
    user = data.user ?? data.session?.user ?? null;
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      logAuthFailure('confirm', 'exchangeCodeForSession gagal', { status: error.status, code: error.code, message: error.message });
      return to('/login?error=link');
    }
    user = data.user ?? data.session?.user ?? null;
  } else {
    logAuthFailure('confirm', 'parameter tautan tidak lengkap', {
      hasTokenHash: !!tokenHash, type, typeValid: !!type && OTP_TYPES.includes(type), hasCode: !!code,
    });
    return to('/login?error=link');
  }

  if (!user) {
    logAuthFailure('confirm', 'verifikasi berhasil tetapi data user kosong');
    return to('/login?error=link');
  }

  let owner: boolean;
  try {
    owner = isOwnerEmail(user.email);
  } catch (e) {
    logAuthFailure('confirm', 'OWNER_EMAIL tidak bisa dibaca', { message: (e as Error).message });
    await supabase.auth.signOut();
    return to('/login?error=config');
  }
  if (!owner) {
    logAuthFailure('confirm', 'email bukan pemilik', {
      email: maskEmail(user.email),
      owner: maskEmail(process.env.OWNER_EMAIL?.trim()),
      ownerLength: process.env.OWNER_EMAIL?.length ?? 0,
    });
    await supabase.auth.signOut();
    return to('/login?error=not_owner');
  }

  // Kategori bawaan dan pengaturan default (idempoten). Gagal di sini tidak menghalangi login.
  const { error: bootError } = await supabase.rpc('bootstrap_user');
  if (bootError) logAuthFailure('confirm', 'bootstrap_user gagal', { code: bootError.code, message: bootError.message });

  return to('/');
}
