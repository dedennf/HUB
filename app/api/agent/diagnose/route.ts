import { NextResponse } from 'next/server';
import { isOwnerEmail } from '@/lib/env';
import { resolveSessionUser } from '@/lib/auth';
import { availableModels, diagnose } from '@/lib/agent/diagnose';
import { geminiConfig } from '@/lib/agent/model';
import { diagnoseLive } from '@/lib/live/diagnose';
import { liveConfig, liveModel } from '@/lib/live/config';
import { createClient } from '@/lib/supabase/server';
import { todayIso } from '@/lib/time';

export const maxDuration = 60;

/** Diagnosa Gemini untuk pemilik (D-45). Buka di browser saat sudah login. Tidak menampilkan API key. */
export async function GET() {
  const user = await resolveSessionUser(await createClient());
  if (!user || !isOwnerEmail(user.email)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cfg = geminiConfig();
  if (!cfg) return NextResponse.json({ error: 'GEMINI_API_KEY atau GEMINI_MODEL belum diisi di server.' }, { status: 200 });
  const [report, models] = await Promise.all([diagnose(cfg), availableModels(cfg)]);
  report.available_models = models;
  // Fase 8: percakapan langsung bila GEMINI_LIVE_MODEL diisi
  const live = liveModel();
  if (live) {
    const db = await createClient();
    const now = new Date();
    report.cases.push(await diagnoseLive(cfg.apiKey, live, await liveConfig(db, 'assistant', now, todayIso(now)), { baseUrl: cfg.baseUrl }));
  }
  console.log('[agent] diagnosa Gemini:', JSON.stringify(report));
  return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
}
