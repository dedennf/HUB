import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionUser } from '@/lib/auth';
import { proposeAction } from '@/lib/agent/actions';
import { callTool } from '@/lib/agent/executor';
import { loadCards, loadLookups } from '@/lib/agent/service';
import { createClient } from '@/lib/supabase/server';
import { todayIso } from '@/lib/time';

const body = z.object({ name: z.string().max(80), args: z.record(z.string(), z.unknown()).default({}), conversation_id: z.uuid().nullish() });

/**
 * Panggilan tool dari sesi Live. Klien meneruskan functionCall Gemini ke sini, lalu mengirim jawabannya balik ke sesi.
 * Aturannya sama dengan loop agen (SPEC 6.2): tool baca dijalankan, tool tulis menjadi usulan yang dikonfirmasi di layar.
 */
export async function POST(req: Request) {
  const db = await createClient();
  if (!(await resolveSessionUser(db))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Panggilan tool tidak valid.' }, { status: 400 });
  const now = new Date();
  const ctx = { db, now, today: todayIso(now) };
  const r = await callTool(ctx, p.data.name, p.data.args);
  if (r.kind === 'read') return NextResponse.json({ response: { result: r.data } });
  if (r.kind === 'error') return NextResponse.json({ response: { error: r.error, field: r.field, candidates: r.candidates } });
  const id = await proposeAction(db, p.data.conversation_id ?? null, r, p.data.args);
  const lookups = await loadLookups(db);
  const [card] = await loadCards(db, [id], lookups, ctx.today);
  return NextResponse.json({ response: { status: 'menunggu_konfirmasi', action_id: id, summary: r.summary }, card, lookups });
}
