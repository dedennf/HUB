import { NextResponse } from 'next/server';
import { isOwnerEmail } from '@/lib/env';
import { resolveSessionUser } from '@/lib/auth';
import { diagnose } from '@/lib/agent/diagnose';
import { geminiConfig } from '@/lib/agent/model';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

/** Diagnosa Gemini untuk pemilik (D-45). Buka di browser saat sudah login. Tidak menampilkan API key. */
export async function GET() {
  const user = await resolveSessionUser(await createClient());
  if (!user || !isOwnerEmail(user.email)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cfg = geminiConfig();
  if (!cfg) return NextResponse.json({ error: 'GEMINI_API_KEY atau GEMINI_MODEL belum diisi di server.' }, { status: 200 });
  const report = await diagnose(cfg);
  console.log('[agent] diagnosa Gemini:', JSON.stringify(report));
  return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
}
