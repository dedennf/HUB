// Ekstraksi struk dengan Gemini (SPEC 7.2): gambar atau PDF → JSON terstruktur.
// Hasil model selalu divalidasi Zod dan dinormalisasi sebelum dipakai untuk usulan aksi.
import { z } from 'zod';
import type { AgentModel } from '@/lib/agent/model';

export const DOC_TYPES = ['receipt', 'transfer_proof', 'invoice', 'ewallet_history', 'unknown'] as const;

/** JSON Schema yang dikirim ke Gemini sebagai responseJsonSchema. */
export const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    doc_type: { type: 'string', enum: [...DOC_TYPES] },
    merchant: { type: ['string', 'null'], description: 'Nama toko, penjual, atau penerima' },
    occurred_at: { type: ['string', 'null'], description: 'Tanggal dan jam transaksi, format YYYY-MM-DDTHH:MM (waktu lokal di dokumen)' },
    currency: { type: 'string', description: 'Kode mata uang, biasanya IDR' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, qty: { type: ['number', 'null'] }, price: { type: ['number', 'null'] } },
        required: ['name'],
      },
    },
    subtotal: { type: ['number', 'null'] },
    discount: { type: ['number', 'null'] },
    tax: { type: ['number', 'null'] },
    total: { type: ['number', 'null'], description: 'Jumlah yang benar-benar dibayar, dalam rupiah utuh tanpa desimal' },
    payment_method: { type: ['string', 'null'], description: 'Cara bayar yang tertulis, mis. GoPay, QRIS, Tunai, Debit BCA' },
    from_account_hint: { type: ['string', 'null'], description: 'Bukti transfer: bank atau dompet asal' },
    to_account_hint: { type: ['string', 'null'], description: 'Bukti transfer: bank atau dompet tujuan' },
    category_hint: { type: ['string', 'null'], description: 'Tebakan kategori, pilih dari daftar kategori pengguna' },
    confidence: { type: 'number', description: '0 sampai 1, seberapa yakin seluruh isi terbaca benar' },
  },
  required: ['doc_type', 'total', 'confidence'],
} as const;

const num = z.preprocess((v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  // "Rp 25.500" atau "25,500" dari model: ambil angkanya saja
  const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}, z.number().nullable());
const text = z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null), z.string().nullable());

const extractionSchema = z.object({
  doc_type: z.preprocess((v) => (DOC_TYPES.includes(v as never) ? v : 'unknown'), z.enum(DOC_TYPES)),
  merchant: text.optional().default(null),
  occurred_at: text.optional().default(null),
  currency: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : 'IDR'), z.string()),
  items: z.array(z.object({ name: z.string(), qty: num.optional().default(null), price: num.optional().default(null) })).max(100).optional().default([]),
  subtotal: num.optional().default(null),
  discount: num.optional().default(null),
  tax: num.optional().default(null),
  total: num.optional().default(null),
  payment_method: text.optional().default(null),
  from_account_hint: text.optional().default(null),
  to_account_hint: text.optional().default(null),
  category_hint: text.optional().default(null),
  confidence: z.preprocess((v) => Math.min(1, Math.max(0, Number(v) || 0)), z.number()),
});
export type Extraction = z.infer<typeof extractionSchema>;

/** Ambang SPEC 7.2: di bawah ini field ditandai meragukan. */
export const LOW_CONFIDENCE = 0.7;

export function buildPrompt(categories: string[], accounts: string[]): string {
  return [
    'Kamu membaca dokumen keuangan milik mahasiswa Indonesia: struk belanja, bukti transfer, tagihan, atau riwayat dompet digital.',
    'Isi JSON sesuai skema. Jangan menebak angka yang tidak terlihat: isi null.',
    'total = jumlah yang benar-benar dibayar dalam rupiah utuh (contoh "Rp25.500" menjadi 25500).',
    'doc_type transfer_proof hanya untuk bukti transfer atau top up antar rekening/dompet. Struk belanja yang dibayar dengan QRIS atau e-wallet tetap receipt.',
    `Akun milik pengguna: ${accounts.join(', ') || '(belum ada)'}. Untuk payment_method, from_account_hint, dan to_account_hint pakai nama akun ini bila cocok.`,
    `Kategori pengeluaran pengguna: ${categories.join(', ') || '(belum ada)'}. category_hint dipilih dari daftar ini.`,
    'confidence rendah (di bawah 0.7) bila gambar buram, terpotong, atau total tidak yakin.',
  ].join('\n');
}

/** Ubah teks JSON dari model menjadi Extraction yang sudah dibersihkan. Bilangan dibulatkan ke rupiah. */
export function parseExtraction(raw: string): Extraction {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const parsed = extractionSchema.parse(JSON.parse(cleaned));
  const round = (n: number | null) => (n === null ? null : Math.round(Math.abs(n)));
  return {
    ...parsed,
    subtotal: round(parsed.subtotal), discount: round(parsed.discount), tax: round(parsed.tax), total: round(parsed.total),
    items: parsed.items.map((i) => ({ name: i.name.slice(0, 80), qty: i.qty, price: round(i.price) })),
  };
}

export async function extractReceipt(model: AgentModel, file: { data: Buffer; mime: string }, ctx: { categories: string[]; accounts: string[]; signal?: AbortSignal }): Promise<Extraction> {
  const turn = await model.generate({
    system: buildPrompt(ctx.categories, ctx.accounts),
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: file.mime, data: file.data.toString('base64') } }, { text: 'Baca dokumen ini.' }] }],
    tools: [], json: EXTRACTION_JSON_SCHEMA, signal: ctx.signal,
  });
  return parseExtraction(turn.text);
}
