import { NextResponse } from 'next/server';
import { isOwnerEmail } from '@/lib/env';
import { resolveSessionUser } from '@/lib/auth';
import { availableModels, diagnose, toneWav } from '@/lib/agent/diagnose';
import { transcribeWithLive, wavToPcm16k } from '@/lib/live/transcribe';
import { synthesize, ttsModel } from '@/lib/english/tts';
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
    // D-63: transkripsi pesan suara lewat Live (nada 1 detik, bukan ucapan: hasil kosong itu wajar)
    const t0 = Date.now();
    try {
      const t = await transcribeWithLive({ apiKey: cfg.apiKey, model: live, pcm: wavToPcm16k(toneWav(1, 440))!, baseUrl: cfg.baseUrl, timeoutMs: 15_000 });
      report.cases.push({ model: live, test: 'transkripsi pesan suara (Live)', ok: true, ms: Date.now() - t0, reply: t ? `"${t.slice(0, 80)}"` : '(tidak ada ucapan, sesuai harapan)' });
    } catch (e) {
      report.cases.push({ model: live, test: 'transkripsi pesan suara (Live)', ok: false, ms: Date.now() - t0, reason: 'galat', detail: (e as Error).message.slice(0, 300) });
    }
  }
  // D-65: suara IELTS Listening
  const tts = ttsModel();
  if (tts) {
    const t0 = Date.now();
    try {
      const { pcm, rate } = await synthesize({ speakers: [{ name: 'Tom', gender: 'male' }, { name: 'Anna', gender: 'female' }], lines: [{ speaker: 'Tom', text: 'Hello.' }, { speaker: 'Anna', text: 'Hi there.' }] }, AbortSignal.timeout(30_000));
      report.cases.push({ model: tts, test: 'suara Listening (TTS dua pembicara)', ok: true, ms: Date.now() - t0, reply: `${(pcm.length / 2 / rate).toFixed(1)} detik audio` });
    } catch (e) {
      report.cases.push({ model: tts, test: 'suara Listening (TTS dua pembicara)', ok: false, ms: Date.now() - t0, reason: 'galat', detail: (e as Error).message.slice(0, 300) });
    }
  }
  console.log('[agent] diagnosa Gemini:', JSON.stringify(report));
  return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
}
