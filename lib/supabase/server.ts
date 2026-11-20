import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabasePublicEnv } from '@/lib/env';

/** Klien Supabase untuk Server Component, Server Action, dan Route Handler. Tunduk pada RLS. */
export async function createClient() {
  // cookies() lebih dulu: menandai halaman sebagai dinamis sehingga tidak di-prerender saat build
  const cookieStore = await cookies();
  const { url, anonKey } = supabasePublicEnv();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component tidak boleh menulis cookie. Penyegaran sesi sudah ditangani proxy.ts.
        }
      },
    },
  });
}
