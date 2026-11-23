import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/auth/'];

/** Menyegarkan sesi Supabase di setiap permintaan dan mengarahkan tamu ke /login. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!url || !anonKey) {
    if (isPublic) return response;
    const to = request.nextUrl.clone();
    to.pathname = '/login';
    to.search = '?error=config';
    return NextResponse.redirect(to);
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Jangan menaruh kode lain di antara createServerClient dan getClaims.
  const { data, error } = await supabase.auth.getClaims();
  let signedIn = !!data?.claims?.sub;
  if (!signedIn && error) {
    // getClaims bisa gagal saat verifikasi token (JWKS). Tanya server Auth sebelum menganggap belum login.
    console.error('[auth] proxy: getClaims gagal, mencoba getUser', { status: error.status, code: error.code, message: error.message });
    const { data: u } = await supabase.auth.getUser();
    signedIn = !!u.user;
  }

  if (!signedIn && !isPublic) {
    const to = request.nextUrl.clone();
    to.pathname = '/login';
    to.search = '';
    return NextResponse.redirect(to);
  }
  return response;
}
