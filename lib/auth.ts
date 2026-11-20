import 'server-only';
import { redirect } from 'next/navigation';
import { isOwnerEmail } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export type CurrentUser = { id: string; email: string };

/** Pengguna yang sedang login. Mengalihkan ke /login jika belum login atau bukan pemilik. */
export async function requireUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect('/login');
  const email = typeof claims.email === 'string' ? claims.email : '';
  if (!isOwnerEmail(email)) {
    await supabase.auth.signOut();
    redirect('/login?error=not_owner');
  }
  return { id: claims.sub, email };
}
