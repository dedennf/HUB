import { NextResponse } from 'next/server';
import { withUsage } from '@/lib/ai-usage';
import { z } from 'zod';
import { resolveSessionUser } from '@/lib/auth';
import { pcmToWav } from '@/lib/english/listening';
import { synthesize, TtsError, type TtsScript } from '@/lib/english/tts';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

/**
 * D-65 langkah 2: ubah naskah Listening menjadi suara dengan TTS Gemini, simpan WAV di bucket privat `listening`,
 * lalu kembalikan tautan sementara. Dipisah dari pembuatan naskah supaya tiap langkah muat di batas 60 detik Vercel.
 */
export async function POST(req: Request) {
  const db = await createClient();
  const user = await resolveSessionUser(db);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as { id?: string } | null;
  if (!z.uuid().safeParse(body?.id).success) return NextResponse.json({ error: 'Latihan tidak valid.' }, { status: 400 });
  const { data } = await db.from('listening_sets').select('id,script,audio_path').eq('id', body!.id!).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Latihan tidak ditemukan.' }, { status: 404 });
  let path = data.audio_path as string | null;
  let duration: number | null = null;
  if (!path) {
    try {
      const { pcm, rate } = await withUsage(db, 'english_tts', () => synthesize(data.script as TtsScript, AbortSignal.timeout(55_000)));
      duration = Math.round(pcm.length / 2 / rate);
      path = `${user.id}/${data.id}.wav`;
      const { error } = await db.storage.from('listening').upload(path, pcmToWav(pcm, rate), { contentType: 'audio/wav', upsert: true });
      if (error) return NextResponse.json({ error: `Gagal menyimpan audio: ${error.message}` }, { status: 500 });
      await db.from('listening_sets').update({ audio_path: path, duration_seconds: duration }).eq('id', data.id);
    } catch (e) {
      if (e instanceof TtsError) return NextResponse.json({ error: e.message }, { status: 503 });
      console.error('[listening] TTS galat:', e);
      return NextResponse.json({ error: 'Audio tidak bisa dibuat. Coba lagi.' }, { status: 500 });
    }
  }
  const { data: signed } = await db.storage.from('listening').createSignedUrl(path, 60 * 60);
  return NextResponse.json({ url: signed?.signedUrl ?? null, duration });
}
