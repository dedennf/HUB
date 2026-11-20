import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { isOwnerEmail } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

const OTP_TYPES: EmailOtpType[] = ['email', 'magiclink', 'signup', 'invite', 'recovery', 'email_change'];

/**
 * Tujuan tautan masuk. Mendukung dua bentuk:
 * - ?token_hash=...&type=email (template email yang disarankan, bisa dibuka di perangkat lain)
 * - ?code=... (template bawaan Supabase, harus dibuka di browser yang sama)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');
  const fail = () => NextResponse.redirect(new URL('/login?error=link', request.url));

  const supabase = await createClient();
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return fail();
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail();
  } else {
    return fail();
  }

  const { data } = await supabase.auth.getClaims();
  if (!isOwnerEmail(typeof data?.claims?.email === 'string' ? data.claims.email : '')) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/login?error=not_owner', request.url));
  }

  // Kategori bawaan dan pengaturan default (idempoten).
  await supabase.rpc('bootstrap_user');
  return NextResponse.redirect(new URL('/', request.url));
}
