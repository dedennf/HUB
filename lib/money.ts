// Nominal uang selalu integer rupiah (SPEC 5).

export function toRupiahInt(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

/** Format DESIGN: Rp1.500.000 (lihat lib/format.ts). */
export { formatRp as formatRupiah } from './format';

/**
 * Membaca input nominal: "15000", "15.000", "15rb", "15k", "1,5jt", "1.5 juta", "ceban", "goceng".
 * Mengembalikan null jika tidak bisa dibaca.
 */
export function parseRupiah(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/^rp\.?\s*/, '');
  if (!s) return null;
  const slang: Record<string, number> = { gopek: 500, seceng: 1000, goceng: 5000, ceban: 10000, goban: 50000, cepek: 100 };
  if (s in slang) return slang[s];
  const m = s.match(/^(\d+(?:[.,]\d+)*)\s*(rb|ribu|k|jt|juta|m|miliar)?$/);
  if (!m) return null;
  const [, num, unit] = m;
  let value: number;
  if (unit) {
    value = Number(num.replace(/\./g, '').replace(',', '.'));
    if (/^\d+\.\d{1,2}$/.test(num)) value = Number(num); // "1.5jt"
    const mult = unit === 'rb' || unit === 'ribu' || unit === 'k' ? 1e3 : unit === 'jt' || unit === 'juta' ? 1e6 : 1e9;
    value *= mult;
  } else {
    if (/^\d{1,3}([.,]\d{3})+$/.test(num)) value = Number(num.replace(/[.,]/g, ''));
    else value = Number(num.replace(',', '.'));
  }
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}
