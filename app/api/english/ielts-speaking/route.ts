import { NextResponse } from 'next/server';
import { withUsage } from '@/lib/ai-usage';
import { resolveSessionUser } from '@/lib/auth';
import { defaultModel, ModelError } from '@/lib/agent/model';
import { SERVER_SILENCE_RMS, wavPeakRms } from '@/lib/agent/voice';
import { bandOf } from '@/lib/english/ielts';
import { assessSpeaking } from '@/lib/english/ielts-ai';
import { markSkillIfToday } from '@/lib/english/ielts-store';
import { loadProfile, logSession, recordMistakes } from '@/lib/english/store';
import { createClient } from '@/lib/supabase/server';
import { todayIso } from '@/lib/time';

export const maxDuration = 60;
const AUDIO = ['audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/mpeg'];
const SKILL = { 1: 'speaking_part1', 2: 'speaking_part2', 3: 'speaking_part3' } as const;

/** D-60: jawaban IELTS Speaking dinilai Gemini dengan empat kriteria resmi. Rekaman tidak disimpan. */
export async function POST(req: Request) {
  const db = await createClient();
  if (!(await resolveSessionUser(db))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const audio = form?.get('audio');
  const prompt = String(form?.get('prompt') ?? '').trim().slice(0, 1500);
  const part = Number(form?.get('part'));
  const seconds = Number(form?.get('seconds')) || 0;
  if (!(audio instanceof File) || !audio.size || !prompt) return NextResponse.json({ error: 'Rekaman atau soal kosong.' }, { status: 400 });
  if (part !== 1 && part !== 2 && part !== 3) return NextResponse.json({ error: 'Part tidak valid.' }, { status: 400 });
  const mime = audio.type.split(';')[0].toLowerCase();
  if (!AUDIO.includes(mime)) return NextResponse.json({ error: `Format rekaman ${mime || 'tidak dikenal'} belum didukung.` }, { status: 415 });
  // batas badan permintaan Vercel 4,5 MB, cukup untuk sekitar 2 menit WAV 16 kHz
  if (audio.size > 4.3 * 1024 * 1024) return NextResponse.json({ error: 'Rekaman terlalu panjang. Maksimal 2 menit.' }, { status: 413 });
  const data = Buffer.from(await audio.arrayBuffer());
  const peak = mime.includes('wav') ? wavPeakRms(data) : null;
  if (peak !== null && peak < SERVER_SILENCE_RMS) return NextResponse.json({ error: 'Tidak ada suara yang terdengar. Coba rekam lagi lebih dekat ke mikrofon.' }, { status: 422 });
  const model = defaultModel();
  if (!model) return NextResponse.json({ error: 'Ra belum tersambung ke Gemini, latihan bicara belum bisa dinilai.' }, { status: 503 });
  try {
    const profile = await loadProfile(db);
    const fb = await withUsage(db, 'english', () => assessSpeaking(model, profile, { part, prompt, seconds, audio: { data, mime: mime === 'audio/x-wav' ? 'audio/wav' : mime } }, AbortSignal.timeout(55_000)));
    if (!fb.heard_speech || !fb.transcript.trim()) return NextResponse.json({ error: 'Ucapanmu tidak tertangkap. Coba rekam lagi.' }, { status: 422 });
    const band = fb.bands ? bandOf(fb.bands) : null;
    const now = new Date();
    await recordMistakes(db, fb.mistakes, now);
    await logSession(db, { kind: 'speaking', seconds, summary: `IELTS Speaking Part ${part}${band != null ? `: band ${band}` : ''}`, score: { part, band, bands: fb.bands ?? null, transcript: fb.transcript.slice(0, 1500) } });
    await markSkillIfToday(db, todayIso(now), SKILL[part]);
    return NextResponse.json({ ...fb, band });
  } catch (e) {
    if (e instanceof ModelError) {
      console.error('[english] penilaian IELTS speaking gagal:', e.reason, e.detail);
      return NextResponse.json({ error: e.reason === 'quota' ? 'Kuota Gemini habis. Coba lagi nanti.' : e.reason === 'budget' ? 'Batas pemakaian Gemini hari ini sudah tercapai.' : e.reason === 'timeout' ? 'Gemini terlalu lama menilai. Coba jawaban yang lebih pendek.' : 'Ra tidak bisa menilai sekarang. Coba lagi sebentar.' }, { status: 503 });
    }
    console.error('[english] penilaian IELTS speaking galat:', e);
    return NextResponse.json({ error: 'Hasil penilaian tidak terbaca. Coba lagi.' }, { status: 500 });
  }
}
