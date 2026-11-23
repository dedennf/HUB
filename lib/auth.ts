import 'server-only';
import { redirect } from 'next/navigation';
import { logAuthFailure, maskEmail } from '@/lib/auth-log';
import { isOwnerEmail } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export type CurrentUser = { id: string; email: string };

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * Identitas pengguna dari sesi. Memakai getClaims() (cepat, tanpa panggilan jaringan jika JWKS
 * sudah tersimpan). Jika getClaims gagal atau klaim email tidak ada, cadangannya getUser()
 * yang bertanya langsung ke server Auth.
 */
export async function resolveSessionUser(supabase: Db): Promise<CurrentUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (claims?.sub && typeof claims.email === 'string' && claims.email) {
    return { id: claims.sub, email: claims.email };
  }
  if (error) logAuthFailure('requireUser', 'getClaims gagal, mencoba getUser', { status: error.status, code: error.code, message: error.message });

  const { data: u, error: userError } = await supabase.auth.getUser();
  if (userError || !u.user) {
    if (userError && userError.status !== 401 && userError.name !== 'AuthSessionMissingError') {
      logAuthFailure('requireUser', 'getUser gagal', { status: userError.status, code: userError.code, message: userError.message });
    }
    return null;
  }
  return { id: u.user.id, email: u.user.email ?? '' };
}

/** Pengguna yang sedang login. Mengalihkan ke /login jika belum login atau bukan pemilik. */
export async function requireUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const user = await resolveSessionUser(supabase);
  if (!user) redirect('/login');
  if (!isOwnerEmail(user.email)) {
    logAuthFailure('requireUser', 'email bukan pemilik', { email: maskEmail(user.email), owner: maskEmail(process.env.OWNER_EMAIL?.trim()) });
    // signOut() di Server Component tidak bisa menghapus cookie, jadi keluarkan lewat Route Handler.
    redirect('/auth/reject');
  }
  return user;
}
