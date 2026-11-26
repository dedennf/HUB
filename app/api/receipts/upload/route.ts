import { NextResponse } from 'next/server';
import { withUsage } from '@/lib/ai-usage';
import { resolveSessionUser } from '@/lib/auth';
import { toolCtx } from '@/lib/agent/context';
import { defaultModel } from '@/lib/agent/model';
import { handleReceiptUpload, MAX_RECEIPT_BYTES, overReceiptLimit, RECEIPT_MIME, RECEIPTS_PER_MIN } from '@/lib/receipts/service';

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * SPEC 7.2: satu struk per permintaan (multipart: file, hash, conversation_id).
 * `hash` = SHA-256 berkas asli yang dihitung klien sebelum dikompres, untuk menolak duplikat.
 */
export async function POST(req: Request) {
  const ctx = await toolCtx();
  const user = await resolveSessionUser(ctx.db);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Format unggahan tidak valid.' }, { status: 400 });
  }
  const file = form.get('file');
  const hash = String(form.get('hash') ?? '').toLowerCase();
  const conv = String(form.get('conversation_id') ?? '');
  const note = String(form.get('note') ?? '').trim().slice(0, 2000);
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Berkas struk kosong.' }, { status: 400 });
  if (!RECEIPT_MIME.includes(file.type as (typeof RECEIPT_MIME)[number])) return NextResponse.json({ error: 'Jenis berkas tidak didukung. Pakai foto (JPG, PNG, WebP, HEIC) atau PDF.' }, { status: 415 });
  if (file.size > MAX_RECEIPT_BYTES) return NextResponse.json({ error: 'Berkas terlalu besar (maks 4 MB). Untuk PDF, kirim halaman struk yang perlu saja.' }, { status: 413 });
  if (!/^[0-9a-f]{64}$/.test(hash)) return NextResponse.json({ error: 'Hash struk tidak valid.' }, { status: 400 });
  if (await overReceiptLimit(ctx)) return NextResponse.json({ error: `Terlalu banyak struk. Maksimal ${RECEIPTS_PER_MIN} per menit.` }, { status: 429 });
  try {
    const data = Buffer.from(await file.arrayBuffer());
    const res = await withUsage(ctx.db, 'receipt', () => handleReceiptUpload(ctx, defaultModel(), {
      userId: user.id, data, mime: file.type, hash,
      fileName: file.name?.slice(0, 80), conversationId: UUID.test(conv) ? conv : null, note: note || undefined,
    }));
    return NextResponse.json(res, { status: res.status === 'duplicate' ? 409 : 200 });
  } catch (e) {
    console.error('[receipt] gagal memproses struk:', e);
    return NextResponse.json({ error: `Gagal memproses struk (${(e as Error).message?.slice(0, 120)}).` }, { status: 500 });
  }
}
