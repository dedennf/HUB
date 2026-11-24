// Pembantu bersama tools: parameter Zod yang ramah keluaran Gemini, resolusi, dan undo.
import { z } from 'zod';
import { formatRp } from '../../format';
import { parseRupiah } from '../../money';
import { isHhmm, isIsoDate, zonedParts, zonedToIso } from '../../time';
import type { Resolution } from '../resolve';
import { fail, type ToolCtx, type ToolError, type UndoOp } from './types';

/** Nominal rupiah: angka, atau teks "30rb", "1,5jt". */
export const money = (desc: string) => z.preprocess(
  (v) => (typeof v === 'string' ? parseRupiah(v) ?? v : v),
  z.number().int().positive(),
).describe(`${desc}. Integer rupiah, mis. 30000.`);

/** Tanggal YYYY-MM-DD. */
export const dateStr = (desc: string) => z.string().refine(isIsoDate, 'Format tanggal YYYY-MM-DD.').describe(`${desc} (YYYY-MM-DD, zona Asia/Jakarta)`);
export const timeStr = (desc: string) => z.string().refine(isHhmm, 'Format jam HH:MM.').describe(`${desc} (HH:MM)`);

/** Waktu: "YYYY-MM-DD", "YYYY-MM-DDTHH:MM" (WIB), atau ISO dengan zona. */
export const when = (desc: string) => z.string().refine((s) => toIso(s) !== null, 'Waktu tidak valid.')
  .describe(`${desc}. Format YYYY-MM-DD atau YYYY-MM-DDTHH:MM (Asia/Jakarta).`);

export function toIso(s: string, defaultTime = '12:00'): string | null {
  const v: string = s.trim();
  if (isIsoDate(v)) return zonedToIso(v, defaultTime);
  const m = (v as string).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (m && isIsoDate(m[1]) && isHhmm(m[2])) return zonedToIso(m[1], m[2]);
  const t = Date.parse(v as string);
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(v as string) && !Number.isNaN(t) ? new Date(t).toISOString() : null;
}

/** Ubah hasil resolusi menjadi id atau galat untuk agen. */
export function pick(r: Resolution, field: string, what: string, query: string): { id: string; label: string } | ToolError {
  if (r.kind === 'found') return { id: r.id, label: r.label };
  if (r.kind === 'ambiguous') return fail(`"${query}" cocok dengan beberapa ${what}. Tanyakan pengguna yang mana.`, { field, candidates: r.candidates });
  return fail(`${what} "${query}" tidak ditemukan.`, { field });
}
export const isErr = (x: unknown): x is ToolError => !!x && typeof x === 'object' && (x as { ok?: unknown }).ok === false;

export const rp = formatRp;
export const dayLabel = (iso: string, ctx: ToolCtx) => {
  const d = zonedParts(iso).date;
  return d === ctx.today ? 'hari ini' : d;
};

/** Sisipkan satu baris dan kembalikan id-nya beserta operasi undo. */
export async function insertRow(ctx: ToolCtx, table: string, row: Record<string, unknown>): Promise<{ id: string; undo: UndoOp } | ToolError> {
  const { data, error } = await ctx.db.from(table).insert(row).select('id').single();
  if (error || !data) return fail(`Gagal menyimpan ke ${table}: ${error?.message ?? 'tanpa data'}`);
  return { id: data.id as string, undo: { op: 'delete', table, id: data.id as string } };
}

/** Ubah satu baris; undo mengembalikan nilai lama kolom yang diubah. */
export async function updateRow(ctx: ToolCtx, table: string, id: string, values: Record<string, unknown>): Promise<UndoOp | ToolError> {
  const { data: old, error: e1 } = await ctx.db.from(table).select(Object.keys(values).join(',')).eq('id', id).maybeSingle();
  if (e1 || !old) return fail(`Data ${table} tidak ditemukan.`);
  const { error } = await ctx.db.from(table).update(values).eq('id', id);
  if (error) return fail(`Gagal mengubah ${table}: ${error.message}`);
  return { op: 'update', table, id, values: old as unknown as Record<string, unknown> };
}

/** Hapus satu baris; undo menyisipkan kembali baris utuh dengan id yang sama. */
export async function deleteRow(ctx: ToolCtx, table: string, id: string): Promise<UndoOp | ToolError> {
  const { data: row } = await ctx.db.from(table).select('*').eq('id', id).maybeSingle();
  if (!row) return fail(`Data ${table} tidak ditemukan.`);
  const { error } = await ctx.db.from(table).delete().eq('id', id);
  if (error) return fail(`Gagal menghapus: ${error.message}`);
  const { user_id: _u, created_at: _c, updated_at: _up, ...rest } = row as Record<string, unknown>;
  void _u; void _c; void _up;
  if (table === 'research_needs') delete rest.is_fulfilled; // kolom generated
  return { op: 'restore', table, row: rest };
}
