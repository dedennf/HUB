import { NextResponse } from 'next/server';
import { withUsage } from '@/lib/ai-usage';
import { resolveSessionUser } from '@/lib/auth';
import { defaultModel, ModelError } from '@/lib/agent/model';
import { SERVER_SILENCE_RMS, wavPeakRms } from '@/lib/agent/voice';
import { evaluateSpeaking } from '@/lib/english/ai';
import { loadProfile, logSession, recordMistakes } from '@/lib/english/store';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;
const AUDIO = ['audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/mpeg'];

/** SPEC 10.2.4 tingkat 1: rekaman jawaban dinilai Gemini (isi, tata bahasa, pilihan kata, versi natural). */
export async function POST(req: Request) {
  const db = await createClient();
  if (!(await resolveSessionUser(db))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const audio = form?.get('audio');
  const question = String(form?.get('question') ?? '').trim().slice(0, 500);
  const seconds = Number(form?.get('seconds')) || 0;
  if (!(audio instanceof File) || !audio.size || !question) return NextResponse.json({ error: 'Rekaman atau pertanyaan kosong.' }, { status: 400 });
  const mime = audio.type.split(';')[0].toLowerCase();
  if (!AUDIO.includes(mime)) return NextResponse.json({ error: `Format rekaman ${mime || 'tidak dikenal'} belum didukung.` }, { status: 415 });
  if (audio.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'Rekaman terlalu panjang. Maksimal 60 detik.' }, { status: 413 });
  const data = Buffer.from(await audio.arrayBuffer());
  const peak = mime.includes('wav') ? wavPeakRms(data) : null;
  if (peak !== null && peak < SERVER_SILENCE_RMS) return NextResponse.json({ error: 'Tidak ada suara yang terdengar. Coba rekam lagi lebih dekat ke mikrofon.' }, { status: 422 });
  const model = defaultModel();
  if (!model) return NextResponse.json({ error: 'Ra belum tersambung ke Gemini, latihan bicara belum bisa dinilai.' }, { status: 503 });
  try {
    const profile = await loadProfile(db);
    const fb = await withUsage(db, 'english', () => evaluateSpeaking(model, profile, { question, audio: { data, mime: mime === 'audio/x-wav' ? 'audio/wav' : mime } }, AbortSignal.timeout(50_000)));
    if (!fb.heard_speech || !fb.transcript.trim()) return NextResponse.json({ error: 'Ucapanmu tidak tertangkap. Coba rekam lagi.' }, { status: 422 });
    await recordMistakes(db, fb.grammar, new Date());
    await logSession(db, { kind: 'speaking', seconds, summary: question, score: { ...(fb.score ?? {}), transcript: fb.transcript.slice(0, 1000) } });
    return NextResponse.json(fb);
  } catch (e) {
    if (e instanceof ModelError) {
      console.error('[english] penilaian bicara gagal:', e.reason, e.detail);
      return NextResponse.json({ error: e.reason === 'quota' ? 'Kuota Gemini habis. Coba lagi nanti.' : e.reason === 'budget' ? 'Batas pemakaian Gemini hari ini sudah tercapai.' : 'Ra tidak bisa menilai sekarang. Coba lagi sebentar.' }, { status: 503 });
    }
    console.error('[english] penilaian bicara galat:', e);
    return NextResponse.json({ error: 'Hasil penilaian tidak terbaca. Coba lagi.' }, { status: 500 });
  }
}
