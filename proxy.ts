import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // semua halaman kecuali aset statis, ikon, manifest, dan service worker
    '/((?!_next/static|_next/image|favicon.ico|icon|manifest.json|sw.js|.*\\.(?:png|svg|ico|webp|jpg)$).*)',
  ],
};
