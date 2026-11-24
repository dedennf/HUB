// Siklus hidup usulan aksi (SPEC 6.3 dan 6.4): proposed → executed / rejected → undone.
// Semua perubahan data tetap lewat registry tools (commitTool) dan undo payload yang disimpan di server.
import type { SupabaseClient } from '@supabase/supabase-js';
import { callTool, commitTool, mergeUndo, undo, type CallResult } from './executor';
import { normalize } from './resolve';
import type { ToolCtx, UndoPayload } from './tools/types';

/** Aksi lanjutan yang dijalankan setelah aksi utama tersimpan, mis. slot mengerjakan tugas dari pengurai lokal. */
export type Followup = { tool: string; args: Record<string, unknown>; ref_field: string };

type Proposal = Extract<CallResult, { kind: 'proposal' }>;

/** Simpan usulan ke agent_actions (status proposed). Belum ada data yang berubah. */
export async function proposeAction(db: SupabaseClient, conversationId: string | null, p: Proposal, originalArgs: unknown, followups: Followup[] = []): Promise<string> {
  const { data, error } = await db.from('agent_actions').insert({
    conversation_id: conversationId, tool_name: p.tool, args: p.resolved as Record<string, unknown>,
    summary: p.summary, permission: p.permission, status: 'proposed',
    result: { doubtful: p.doubtful ?? [], warning: p.warning ?? null, original_args: originalArgs ?? {}, followups },
  }).select('id').single();
  if (error || !data) throw new Error(`Gagal menyimpan usulan: ${error?.message}`);
  return data.id;
}

type Row = {
  id: string; tool_name: string; args: Record<string, unknown>; summary: string; status: string; permission: string;
  result: { doubtful?: string[]; warning?: string | null; original_args?: Record<string, unknown>; followups?: Followup[] } | null;
  undo_payload: UndoPayload | null;
};
export type Edits = Record<string, Record<string, string>>;
export type ConfirmResult = { ok: boolean; message: string; executed: string[] };

const EDITABLE = new Set(['amount', 'account', 'category', 'occurred_at', 'from_account', 'to_account', 'course', 'due_at']);

/** Kunci memori dari merchant atau catatan singkat. Catatan panjang tidak dijadikan aturan. */
export function memoryKey(merchant: unknown, note: unknown): string | null {
  for (const v of [merchant, note]) {
    const k = typeof v === 'string' ? normalize(v) : '';
    if (k && k.length <= 40 && k.split(' ').length <= 3) return k;
  }
  return null;
}

async function remember(db: SupabaseClient, kind: string, key: string, value: Record<string, unknown>, now: Date) {
  const { data } = await db.from('agent_memory').select('id,value,confidence').eq('kind', kind).eq('key', key).maybeSingle();
  if (data) {
    const same = JSON.stringify(data.value) === JSON.stringify(value);
    await db.from('agent_memory').update({ value, confidence: same ? Math.min(1, Number(data.confidence) + 0.1) : 0.7, last_used_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', data.id);
  } else {
    await db.from('agent_memory').insert({ kind, key, value, confidence: 0.7, last_used_at: now.toISOString() });
  }
}

/** Belajar dari koreksi pengguna (SPEC 7.2): kategori → merchant_rule, akun → correction, mata kuliah → alias. */
export async function learnFromEdits(ctx: ToolCtx, tool: string, before: Record<string, unknown>, after: Record<string, unknown>, original: Record<string, unknown>) {
  if (tool === 'add_transaction') {
    const key = memoryKey(after.merchant, after.note);
    if (!key) return;
    if (after.category_id && after.category_id !== before.category_id) await remember(ctx.db, 'merchant_rule', key, { category_id: after.category_id }, ctx.now);
    if (after.account_id && after.account_id !== before.account_id) await remember(ctx.db, 'correction', key, { account_id: after.account_id }, ctx.now);
  }
  if (tool === 'add_task' && after.course_id && after.course_id !== before.course_id && typeof original.course === 'string') {
    const key = normalize(original.course);
    if (key) await remember(ctx.db, 'alias', key, { course_id: after.course_id }, ctx.now);
  }
}

async function loadRows(db: SupabaseClient, ids: string[], status: string): Promise<Row[]> {
  const { data } = await db.from('agent_actions').select('id,tool_name,args,summary,status,permission,result,undo_payload').in('id', ids).eq('status', status).order('created_at');
  return (data ?? []) as Row[];
}

/** Status struk mengikuti nasib usulannya (D-46): disetujui → confirmed, ditolak atau di-undo → rejected (boleh diunggah ulang). */
async function setReceiptStatus(db: SupabaseClient, rows: { args: Record<string, unknown> }[], status: 'confirmed' | 'rejected') {
  const ids = [...new Set(rows.map((r) => r.args?.receipt_id).filter((x): x is string => typeof x === 'string'))];
  if (ids.length) await db.from('receipts').update({ status, updated_at: new Date().toISOString() }).in('id', ids);
}

export async function rejectActions(ctx: ToolCtx, ids: string[]): Promise<ConfirmResult> {
  const { data: rows } = await ctx.db.from('agent_actions').update({ status: 'rejected', updated_at: ctx.now.toISOString() }).in('id', ids).eq('status', 'proposed').select('args');
  await setReceiptStatus(ctx.db, (rows ?? []) as { args: Record<string, unknown> }[], 'rejected');
  return { ok: true, message: 'Tidak disimpan.', executed: [] };
}

/**
 * Jalankan usulan yang disetujui, berurutan. Bila satu gagal, yang sudah jalan di batch ini dibalik
 * supaya "Setujui semua" tidak menyisakan setengah data.
 */
export async function approveActions(ctx: ToolCtx, ids: string[], edits: Edits = {}): Promise<ConfirmResult> {
  const rows = await loadRows(ctx.db, ids, 'proposed');
  if (!rows.length) return { ok: false, message: 'Usulan sudah tidak berlaku. Coba minta ulang.', executed: [] };
  const done: { row: Row; undo: UndoPayload }[] = [];
  const rollback = async (failed: Row, msg: string): Promise<ConfirmResult> => {
    await undo(ctx, mergeUndo(done.map((d) => d.undo)));
    await ctx.db.from('agent_actions').update({ status: 'failed', result: { ...failed.result, error: msg } }).eq('id', failed.id);
    return { ok: false, message: `Gagal menyimpan "${failed.summary}": ${msg}. Tidak ada yang tersimpan.`, executed: [] };
  };

  for (const row of rows) {
    let resolved = row.args;
    let summary = row.summary;
    const change = Object.fromEntries(Object.entries(edits[row.id] ?? {}).filter(([k, v]) => EDITABLE.has(k) && typeof v === 'string'));
    const original = row.result?.original_args ?? {};
    if (Object.keys(change).length) {
      const re = await callTool(ctx, row.tool_name, { ...original, ...change });
      if (re.kind !== 'proposal') return rollback(row, re.kind === 'error' ? re.error : 'ubahan tidak valid');
      resolved = re.resolved as Record<string, unknown>;
      summary = re.summary;
      await learnFromEdits(ctx, row.tool_name, row.args, resolved, original);
    }
    const res = await commitTool(ctx, row.tool_name, resolved);
    if (!res.ok) return rollback(row, res.error);
    const undos = [res.undo];
    for (const f of row.result?.followups ?? []) {
      const p = await callTool(ctx, f.tool, { ...f.args, [f.ref_field]: String(res.data?.id ?? '') });
      if (p.kind !== 'proposal') continue;
      const c = await commitTool(ctx, f.tool, { ...(p.resolved as object), suggested_by_agent: false });
      if (c.ok) undos.push(c.undo);
    }
    const payload = mergeUndo(undos);
    done.push({ row, undo: payload });
    await ctx.db.from('agent_actions').update({
      status: 'executed', args: resolved, summary, undo_payload: payload, executed_at: ctx.now.toISOString(),
      result: { ...row.result, data: res.data ?? null, edited: Object.keys(change) },
    }).eq('id', row.id);
    row.args = resolved;
  }
  await setReceiptStatus(ctx.db, done.map((d) => d.row), 'confirmed');
  return { ok: true, message: `Tersimpan: ${done.map((d) => d.row.summary.split(' · ')[0]).join(', ')}`, executed: done.map((d) => d.row.id) };
}

/** Undo dari kartu, toast, atau Log Agen. Payload diambil dari database, bukan dari klien. */
export async function undoActions(ctx: ToolCtx, ids: string[]): Promise<{ ok: boolean; message: string }> {
  const rows = (await loadRows(ctx.db, ids, 'executed')).reverse();
  if (!rows.length) return { ok: false, message: 'Tidak ada aksi yang bisa dibatalkan.' };
  const errors: string[] = [];
  for (const row of rows) {
    if (!row.undo_payload) { errors.push(`${row.summary}: tidak punya data undo`); continue; }
    const r = await undo(ctx, row.undo_payload);
    if (!r.ok) { errors.push(...r.errors); continue; }
    await ctx.db.from('agent_actions').update({ status: 'undone', updated_at: ctx.now.toISOString() }).eq('id', row.id);
    await setReceiptStatus(ctx.db, [row], 'rejected');
  }
  return errors.length ? { ok: false, message: `Sebagian gagal dibatalkan: ${errors.join('; ')}` } : { ok: true, message: 'Dibatalkan.' };
}
