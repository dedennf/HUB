// Skema Zod untuk semua input dari formulir (SPEC 2: validasi Zod).
import { z } from 'zod';
import { parseRupiah } from './money';
import { isHhmm, isIsoDate } from './time';

const uuid = z.uuid('Pilihan tidak valid.');
const optionalUuid = z.preprocess((v) => (v === '' || v == null ? null : v), uuid.nullable());
const optionalText = (max: number) => z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().max(max).nullable());

export const rupiahInput = z.preprocess(
  (v) => (typeof v === 'number' ? v : parseRupiah(String(v ?? ''))),
  z.number({ error: 'Nominal tidak bisa dibaca. Contoh: 25000, 25rb, 1,5jt.' }).int().nonnegative(),
);

export const transactionInput = z.object({
  kind: z.enum(['expense', 'income', 'transfer']),
  amount: rupiahInput.refine((n) => n > 0, 'Nominal harus lebih dari nol.'),
  account_id: uuid,
  to_account_id: optionalUuid,
  category_id: optionalUuid,
  subcategory: optionalText(80),
  note: optionalText(500),
  date: z.string().refine(isIsoDate, 'Tanggal tidak valid.'),
  time: z.preprocess((v) => (v === '' || v == null ? '12:00' : v), z.string().refine(isHhmm, 'Jam tidak valid.')),
}).superRefine((v, ctx) => {
  if (v.kind === 'transfer') {
    if (!v.to_account_id) ctx.addIssue({ code: 'custom', path: ['to_account_id'], message: 'Pilih akun tujuan.' });
    else if (v.to_account_id === v.account_id) ctx.addIssue({ code: 'custom', path: ['to_account_id'], message: 'Akun tujuan harus berbeda.' });
  }
});
export type TransactionInput = z.infer<typeof transactionInput>;

export const accountInput = z.object({
  name: z.string().trim().min(1, 'Nama akun wajib diisi.').max(60),
  type: z.enum(['bank', 'ewallet', 'cash', 'investment']),
  opening_balance: z.preprocess(
    (v) => { const s = String(v ?? '').trim(); if (!s) return 0; const neg = s.startsWith('-'); const n = parseRupiah(neg ? s.slice(1) : s); return n == null ? NaN : neg ? -n : n; },
    z.number({ error: 'Saldo awal tidak bisa dibaca.' }).int(),
  ),
  aliases: z.preprocess((v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean), z.array(z.string().max(60)).max(20)),
  is_archived: z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean()),
});
export type AccountInput = z.infer<typeof accountInput>;

export type FormState = { ok: boolean; message?: string; fieldErrors?: Record<string, string> };

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_');
    out[key] ??= issue.message;
  }
  return out;
}
