import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { resolveSessionUser } from '@/lib/auth';
import { approveActions, rejectActions } from '@/lib/agent/actions';
import { toolCtx } from '@/lib/agent/context';

const body = z.object({
  action_ids: z.array(z.uuid()).min(1).max(20),
  decision: z.enum(['approve', 'reject']),
  edits: z.record(z.uuid(), z.record(z.string(), z.string().max(200))).optional(),
});

/** SPEC 6.3: setujui atau tolak usulan. Ubahan chip dikirim sebagai `edits` per aksi. */
export async function POST(req: Request) {
  const ctx = await toolCtx();
  if (!(await resolveSessionUser(ctx.db))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Permintaan tidak valid.' }, { status: 400 });
  const { action_ids, decision, edits } = parsed.data;
  const r = decision === 'approve' ? await approveActions(ctx, action_ids, edits) : await rejectActions(ctx, action_ids);
  if (r.executed.length) revalidatePath('/', 'layout');
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
