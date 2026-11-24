// Menjalankan tools (SPEC 6.2 dan 6.3): tool baca langsung, tool tulis jadi usulan, commit setelah disetujui, undo.
import { getTool } from './tools';
import { fail, type Committed, type Permission, type ToolCtx, type ToolError, type UndoPayload } from './tools/types';

export type CallResult =
  | { kind: 'read'; ok: true; data: unknown }
  | { kind: 'proposal'; ok: true; tool: string; permission: Exclude<Permission, 'read'>; summary: string; resolved: unknown; doubtful?: string[]; warning?: string }
  | ({ kind: 'error' } & ToolError);

/** Validasi argumen dengan Zod lalu jalankan (baca) atau siapkan usulan (tulis). Tidak pernah mengubah data. */
export async function callTool(ctx: ToolCtx, name: string, rawArgs: unknown): Promise<CallResult> {
  const tool = getTool(name);
  if (!tool) return { kind: 'error', ...fail(`Tool "${name}" tidak ada.`) };
  const parsed = tool.parameters.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { kind: 'error', ...fail(`Argumen tidak valid: ${issue.path.join('.') || '(root)'} ${issue.message}`, { field: issue.path.join('.') }) };
  }
  try {
    if (tool.permission === 'read') {
      const r = await tool.run(ctx, parsed.data);
      return r.ok ? { kind: 'read', ok: true, data: r.data } : { kind: 'error', ...r };
    }
    const p = await tool.prepare(ctx, parsed.data);
    if (!p.ok) return { kind: 'error', ...p };
    return { kind: 'proposal', ok: true, tool: name, permission: tool.permission, summary: p.summary, resolved: p.resolved, doubtful: p.doubtful, warning: p.warning };
  } catch (e) {
    return { kind: 'error', ...fail(`Tool ${name} gagal: ${(e as Error).message}`) };
  }
}

/** Jalankan usulan yang sudah disetujui pengguna. */
export async function commitTool(ctx: ToolCtx, name: string, resolved: unknown): Promise<Committed> {
  const tool = getTool(name);
  if (!tool || tool.permission === 'read') return fail(`Tool tulis "${name}" tidak ada.`);
  try {
    return await tool.commit(ctx, resolved);
  } catch (e) {
    return fail(`Tool ${name} gagal: ${(e as Error).message}`);
  }
}

const UNDOABLE = new Set([
  'transactions', 'tasks', 'task_work_slots', 'events', 'courses', 'course_schedules', 'materials', 'bills', 'investments',
  'research_targets', 'research_ideas', 'research_needs', 'vocab', 'vocab_reviews', 'writing_submissions', 'mistake_patterns',
  'automations', 'agent_memory',
]);

/** Balik semua operasi (urutan terbalik). Saldo akun ikut kembali lewat pemicu database. */
export async function undo(ctx: ToolCtx, payload: UndoPayload): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  for (const op of [...payload.ops].reverse()) {
    if (!UNDOABLE.has(op.table)) { errors.push(`Tabel ${op.table} tidak bisa di-undo.`); continue; }
    const res = op.op === 'delete'
      ? await ctx.db.from(op.table).delete().eq('id', op.id)
      : op.op === 'update'
        ? await ctx.db.from(op.table).update(op.values).eq('id', op.id)
        : await ctx.db.from(op.table).insert(op.row);
    if (res.error) errors.push(`${op.op} ${op.table}: ${res.error.message}`);
  }
  return { ok: errors.length === 0, errors };
}

/** Gabungkan beberapa undo menjadi satu (untuk "Setujui semua"). */
export const mergeUndo = (list: UndoPayload[]): UndoPayload => ({ ops: list.flatMap((u) => u.ops) });
