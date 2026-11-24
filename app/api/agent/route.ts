import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionUser } from '@/lib/auth';
import { toolCtx } from '@/lib/agent/context';
import { defaultModel } from '@/lib/agent/model';
import { handleMessage, overRateLimit, RATE_LIMIT_PER_MIN } from '@/lib/agent/service';

export const maxDuration = 60;

const body = z.object({ text: z.string().trim().min(1).max(2000), conversation_id: z.uuid().nullish() });

/** SPEC 6.2: pesan teks ke Ra. Menerima multipart (text, conversation_id) atau JSON. */
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
  const parsed = body.safeParse({ ...raw, conversation_id: raw.conversation_id || null });
  if (!parsed.success) return NextResponse.json({ error: 'Pesan kosong atau terlalu panjang.' }, { status: 400 });
  if (await overRateLimit(ctx)) return NextResponse.json({ error: `Terlalu banyak pesan. Maksimal ${RATE_LIMIT_PER_MIN} per menit, tunggu sebentar.` }, { status: 429 });
  const steps = Number(await ctx.db.from('settings').select('value').eq('key', 'agent_max_steps').maybeSingle().then((r) => r.data?.value));
  const maxSteps = Number.isInteger(steps) && steps > 0 ? Math.min(steps, 12) : 6;
  try {
    const res = await handleMessage(ctx, defaultModel(), parsed.data.text, parsed.data.conversation_id ?? null, { maxSteps, signal: req.signal });
    return NextResponse.json(res);
  } catch (e) {
    console.error('[agent] gagal memproses pesan:', e);
    return NextResponse.json({ error: `Ra gagal memproses pesan (${(e as Error).message?.slice(0, 120) || 'galat server'}). Coba lagi.` }, { status: 500 });
  }
}
