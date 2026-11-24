import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionUser } from '@/lib/auth';
import { toolCtx } from '@/lib/agent/context';
import { defaultModel } from '@/lib/agent/model';
import { handleMessage, overRateLimit, RATE_LIMIT_PER_MIN } from '@/lib/agent/service';

export const maxDuration = 60;

const body = z.object({ text: z.string().trim().max(2000).default(''), conversation_id: z.uuid().nullish() });

/** Format rekaman yang diterima (SPEC 7.3). Klien mengirim WAV 16 kHz bila bisa, selain itu format asli perekam. */
const AUDIO_MIME = ['audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/mpeg'];
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/** SPEC 6.1 dan 6.2: pesan teks atau suara ke Ra. Menerima multipart (text, audio, conversation_id) atau JSON. */
export async function POST(req: Request) {
  const ctx = await toolCtx();
  if (!(await resolveSessionUser(ctx.db))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let raw: Record<string, unknown>;
  try {
    raw = (req.headers.get('content-type') ?? '').includes('application/json')
      ? await req.json()
      : Object.fromEntries((await req.formData()).entries());
  } catch {
    return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 });
  }
  const audioFile = raw.audio instanceof File && raw.audio.size > 0 ? raw.audio : null;
  const parsed = body.safeParse({ text: typeof raw.text === 'string' ? raw.text : '', conversation_id: raw.conversation_id || null });
  if (!parsed.success || (!parsed.data.text && !audioFile)) return NextResponse.json({ error: 'Pesan kosong atau terlalu panjang.' }, { status: 400 });
  let audio: { data: Buffer; mime: string } | undefined;
  if (audioFile) {
    const mime = audioFile.type.split(';')[0].toLowerCase();
    if (!AUDIO_MIME.includes(mime)) return NextResponse.json({ error: `Format rekaman ${mime || 'tidak dikenal'} belum didukung.` }, { status: 415 });
    if (audioFile.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'Rekaman terlalu panjang. Maksimal 60 detik.' }, { status: 413 });
    audio = { data: Buffer.from(await audioFile.arrayBuffer()), mime: mime === 'audio/x-wav' ? 'audio/wav' : mime };
  }
  if (await overRateLimit(ctx)) return NextResponse.json({ error: `Terlalu banyak pesan. Maksimal ${RATE_LIMIT_PER_MIN} per menit, tunggu sebentar.` }, { status: 429 });
  const steps = Number(await ctx.db.from('settings').select('value').eq('key', 'agent_max_steps').maybeSingle().then((r) => r.data?.value));
  const maxSteps = Number.isInteger(steps) && steps > 0 ? Math.min(steps, 12) : 6;
  try {
    const res = await handleMessage(ctx, defaultModel(), parsed.data.text, parsed.data.conversation_id ?? null, { maxSteps, signal: req.signal, audio });
    return NextResponse.json(res);
  } catch (e) {
    console.error('[agent] gagal memproses pesan:', e);
    return NextResponse.json({ error: `Ra gagal memproses pesan (${(e as Error).message?.slice(0, 120) || 'galat server'}). Coba lagi.` }, { status: 500 });
  }
}
