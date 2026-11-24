import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { resolveSessionUser } from '@/lib/auth';
import { undoActions } from '@/lib/agent/actions';
import { toolCtx } from '@/lib/agent/context';

const body = z.object({ action_ids: z.array(z.uuid()).min(1).max(20) });

/** SPEC 6.4: undo memakai undo_payload yang tersimpan di server. */
export async function POST(req: Request) {
  const ctx = await toolCtx();
  if (!(await resolveSessionUser(ctx.db))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Permintaan tidak valid.' }, { status: 400 });
  const r = await undoActions(ctx, parsed.data.action_ids);
  revalidatePath('/', 'layout');
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
