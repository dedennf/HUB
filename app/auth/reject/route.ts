import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Mengeluarkan sesi yang bukan milik pemilik lalu kembali ke /login?error=not_owner.
 * Harus berupa Route Handler: Server Component (layout) tidak boleh menghapus cookie,
 * sehingga signOut() di sana tidak berefek dan sesi lama terus tertinggal.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login?error=not_owner', request.url));
}
