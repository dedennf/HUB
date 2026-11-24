import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionUser } from '@/lib/auth';
import { insertMessages } from '@/lib/agent/core';
import { logSession } from '@/lib/english/store';
import { createClient } from '@/lib/supabase/server';

const body = z.object({
  conversation_id: z.uuid(),
  mode: z.enum(['assistant', 'english']),
  seconds: z.number().min(0).max(7200),
  turns: z.array(z.object({ role: z.enum(['user', 'model']), text: z.string().max(4000) })).max(200),
});

/** Akhir percakapan langsung: transkrip disimpan ke riwayat (audio tidak disimpan), latihan bahasa dicatat. */
export async function POST(req: Request) {
  const db = await createClient();
  if (!(await resolveSessionUser(db))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Data tidak valid.' }, { status: 400 });
  const turns = p.data.turns.filter((t) => t.text.trim());
  if (turns.length) {
    await insertMessages(db, turns.map((t) => ({
      conversation_id: p.data.conversation_id, role: t.role,
      content: { role: t.role, parts: [{ text: t.role === 'user' ? `[percakapan suara] ${t.text.trim()}` : t.text.trim() }] },
    })));
  }
  if (p.data.mode === 'english' && p.data.seconds >= 20) {
    await logSession(db, { kind: 'speaking', seconds: p.data.seconds, summary: `Percakapan langsung, ${turns.filter((t) => t.role === 'user').length} giliran` });
  }
  return NextResponse.json({ ok: true });
}
