// Tool struk (SPEC 6.8, 7.2). Membaca gambar dengan Gemini Vision dikerjakan di fase Struk (D-35).
import { z } from 'zod';
import type { ReadTool } from './types';

export const readReceipt: ReadTool<z.ZodObject<{ receipt_id: z.ZodUUID }>> = {
  name: 'read_receipt', module: 'receipt', permission: 'read',
  description: 'Baca isi struk yang sudah diunggah (merchant, tanggal, item, total, jenis dokumen). Hasil ekstraksi tersimpan di kolom extracted.',
  parameters: z.object({ receipt_id: z.uuid() }),
  async run(ctx, { receipt_id }) {
    const { data } = await ctx.db.from('receipts').select('id,status,extracted,mime_type').eq('id', receipt_id).maybeSingle();
    if (!data) return { ok: false, error: 'Struk tidak ditemukan.', field: 'receipt_id' };
    if (!data.extracted) return { ok: false, error: 'Struk belum dibaca. Pembacaan gambar hadir di fase Struk.' };
    return { ok: true, data };
  },
};

export const receiptTools = [readReceipt];
