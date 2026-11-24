import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const sub = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
  device_label: z.string().max(80).optional(),
});

/** SPEC 9: simpan langganan push satu perangkat (laptop dan HP bisa sama-sama berlangganan). */
export async function POST(req: Request) {
  const db = await createClient();
  if (!(await resolveSessionUser(db))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = sub.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Langganan push tidak valid.' }, { status: 400 });
  const { error } = await db.from('push_subscriptions').upsert(
    { endpoint: parsed.data.endpoint, keys: parsed.data.keys, device_label: parsed.data.device_label ?? null },
    { onConflict: 'endpoint' },
  );
  if (error) return NextResponse.json({ error: `Gagal menyimpan: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Berhenti berlangganan di perangkat ini. */
export async function DELETE(req: Request) {
  const db = await createClient();
  if (!(await resolveSessionUser(db))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ error: 'endpoint kosong' }, { status: 400 });
  await db.from('push_subscriptions').delete().eq('endpoint', body.endpoint);
  return NextResponse.json({ ok: true });
}
