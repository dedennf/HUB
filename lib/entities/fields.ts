// Pembantu Zod untuk formulir generik (Fase 1c). Nilai datang dari FormData sebagai string.
import { z } from 'zod';
import { parseRupiah } from '../money';
import { isHhmm, isIsoDate } from '../time';

const blankToNull = (v: unknown) => (v === '' || v == null ? null : v);
const trimmed = (v: unknown) => (typeof v === 'string' ? v.trim() : v);

export const f = {
  text: (label: string, max = 120) => z.preprocess(trimmed, z.string({ error: `${label} wajib diisi.` }).min(1, `${label} wajib diisi.`).max(max, `${label} maksimal ${max} huruf.`)),
  optText: (max = 500) => z.preprocess((v) => blankToNull(trimmed(v)), z.string().max(max, `Maksimal ${max} huruf.`).nullable()),
  date: (label: string) => z.string({ error: `${label} wajib diisi.` }).refine(isIsoDate, `${label} tidak valid.`),
  optDate: () => z.preprocess(blankToNull, z.string().refine(isIsoDate, 'Tanggal tidak valid.').nullable()),
  time: (label: string) => z.string({ error: `${label} wajib diisi.` }).refine(isHhmm, `${label} tidak valid (contoh 08:00).`),
  optTime: () => z.preprocess(blankToNull, z.string().refine(isHhmm, 'Jam tidak valid (contoh 08:00).').nullable()),
  money: (label: string) => z.preprocess(
    (v) => (typeof v === 'number' ? v : parseRupiah(String(v ?? ''))),
    z.number({ error: `${label} tidak bisa dibaca. Contoh: 25000, 25rb, 1,5jt.` }).int().nonnegative(),
  ),
  optMoney: () => z.preprocess(
    (v) => (v === '' || v == null ? null : typeof v === 'number' ? v : parseRupiah(String(v)) ?? Number.NaN),
    z.number({ error: 'Nominal tidak bisa dibaca. Contoh: 25000, 25rb, 1,5jt.' }).int().nonnegative().nullable(),
  ),
  int: (label: string, min: number, max: number) => z.preprocess(
    (v) => (v === '' || v == null ? Number.NaN : Number(v)),
    z.number({ error: `${label} harus angka.` }).int(`${label} harus bilangan bulat.`).min(min, `${label} minimal ${min}.`).max(max, `${label} maksimal ${max}.`),
  ),
  optInt: (min: number, max: number) => z.preprocess(
    (v) => (v === '' || v == null ? null : Number(v)),
    z.number({ error: 'Harus angka.' }).int('Harus bilangan bulat.').min(min, `Minimal ${min}.`).max(max, `Maksimal ${max}.`).nullable(),
  ),
  uuid: (label: string) => z.uuid(`Pilih ${label}.`),
  optUuid: () => z.preprocess(blankToNull, z.uuid('Pilihan tidak valid.').nullable()),
  bool: () => z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean()),
  tags: () => z.preprocess(
    (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    z.array(z.string().max(60)).max(30),
  ),
  choice: <T extends readonly [string, ...string[]]>(values: T) => z.enum(values, { error: 'Pilihan tidak valid.' }),
  optChoice: <T extends readonly [string, ...string[]]>(values: T) => z.preprocess(blankToNull, z.enum(values, { error: 'Pilihan tidak valid.' }).nullable()),
};

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_');
    out[key] ??= issue.message;
  }
  return out;
}
