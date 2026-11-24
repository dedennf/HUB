import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { todayIso } from '@/lib/time';
import type { ToolCtx } from './tools/types';

/** Konteks tool untuk pengguna yang sedang login (klien Supabase tunduk RLS). */
export async function toolCtx(): Promise<ToolCtx> {
  const now = new Date();
  return { db: await createClient(), today: todayIso(now), now };
}
