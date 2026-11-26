// Alur unggah struk (SPEC 7.2): tolak duplikat → simpan ke bucket privat → Gemini membaca → usulan aksi.
// Data baru berubah setelah pengguna menyetujui kartu, sama seperti input teks (SPEC 6.3).
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureConversation, insertMessages } from '@/lib/agent/core';
import { ModelError, type AgentModel } from '@/lib/agent/model';
import { loadCards, loadLookups } from '@/lib/agent/service';
import type { CardView, Lookups } from '@/lib/agent/cards';
import type { ToolCtx } from '@/lib/agent/tools/types';
import { formatRp } from '@/lib/format';
import { zonedParts } from '@/lib/time';
import { extractReceipt } from './extract';
import { proposeFromReceipt } from './propose';

export const RECEIPT_BUCKET = 'receipts';
export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024; // batas body fungsi Vercel 4,5 MB (D-46)
export const RECEIPT_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'] as const;
export const RECEIPTS_PER_MIN = 20;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };

export type ReceiptCard = CardView & { receipt_url?: string; receipt_mime?: string };
export type ReceiptResult =
  | { status: 'proposed'; conversation_id: string; receipt_id: string; reply: string; proposed_actions: ReceiptCard[]; lookups: Lookups }
  | { status: 'duplicate'; message: string; transaction?: { id: string; label: string; href: string } }
  | { status: 'unreadable' | 'offline'; message: string; receipt_id?: string };

export async function overReceiptLimit(ctx: ToolCtx): Promise<boolean> {
  const since = new Date(ctx.now.getTime() - 60_000).toISOString();
  const { count } = await ctx.db.from('receipts').select('id', { count: 'exact', head: true }).gte('created_at', since);
  return (count ?? 0) >= RECEIPTS_PER_MIN;
}

/** Struk dengan hash sama yang belum ditolak = duplikat. Tautkan ke transaksinya bila sudah tercatat. */
async function findDuplicate(db: SupabaseClient, hash: string): Promise<ReceiptResult | null> {
  const { data: r } = await db.from('receipts').select('id,status').eq('image_hash', hash).neq('status', 'rejected').limit(1).maybeSingle();
  if (!r) return null;
  const { data: tx } = await db.from('transactions').select('id,amount,kind,merchant,occurred_at').eq('receipt_id', r.id).order('created_at').limit(1).maybeSingle();
  if (tx) {
    const label = `${tx.kind === 'transfer' ? 'Transfer' : tx.merchant ?? 'Transaksi'} ${formatRp(tx.amount)} · ${zonedParts(tx.occurred_at).date}`;
    return { status: 'duplicate', message: `Struk ini sudah pernah dicatat: ${label}.`, transaction: { id: tx.id, label, href: `/keuangan/transaksi/${tx.id}` } };
  }
  return { status: 'duplicate', message: 'Struk ini sudah diunggah dan masih menunggu konfirmasi. Cek kartu usulannya di Ra atau di Log Agen.' };
}

async function cleanup(db: SupabaseClient, id: string | null, path: string) {
  if (id) await db.from('receipts').delete().eq('id', id);
  await db.storage.from(RECEIPT_BUCKET).remove([path]);
}

export async function signedReceiptUrl(db: SupabaseClient, path: string, seconds = 600): Promise<string | undefined> {
  const { data } = await db.storage.from(RECEIPT_BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl;
}

const OFFLINE: Record<ModelError['reason'], string> = {
  not_configured: 'Gemini belum diatur', quota: 'kuota Gemini habis', budget: 'batas harian Gemini di Kompas tercapai', timeout: 'Gemini terlalu lama menjawab', rejected: 'permintaan ditolak Gemini', unavailable: 'Gemini tidak bisa dihubungi',
};

export async function handleReceiptUpload(ctx: ToolCtx, model: AgentModel | null, input: {
  userId: string; data: Buffer; mime: string; hash: string; fileName?: string; conversationId: string | null; budgetMs?: number;
}): Promise<ReceiptResult> {
  const db = ctx.db;
  const dup = await findDuplicate(db, input.hash);
  if (dup) return dup;
  if (!model) return { status: 'offline', message: 'Ra belum tersambung ke Gemini (belum diatur), jadi struk belum bisa dibaca. Catat manual dulu.' };

  const path = `${input.userId}/${input.hash}.${EXT[input.mime] ?? 'bin'}`;
  const up = await db.storage.from(RECEIPT_BUCKET).upload(path, input.data, { contentType: input.mime, upsert: true });
  if (up.error) throw new Error(`Gagal menyimpan struk: ${up.error.message}`);
  const { data: row, error } = await db.from('receipts').insert({ storage_path: path, image_hash: input.hash, mime_type: input.mime, status: 'pending' }).select('id').single();
  if (error || !row) {
    await cleanup(db, null, path);
    // dua unggahan bersamaan dengan hash sama: yang kalah dianggap duplikat
    if (error?.code === '23505') return (await findDuplicate(db, input.hash)) ?? { status: 'duplicate', message: 'Struk ini sudah pernah diunggah.' };
    throw new Error(`Gagal mencatat struk: ${error?.message}`);
  }

  const [lookups, cats] = await Promise.all([loadLookups(db), db.from('categories').select('name').eq('kind', 'expense').eq('is_hidden', false)]);
  let extraction;
  try {
    extraction = await extractReceipt(model, { data: input.data, mime: input.mime }, {
      categories: (cats.data ?? []).map((c) => c.name), accounts: lookups.accounts.map((a) => a.name),
      signal: AbortSignal.timeout(input.budgetMs ?? 40_000),
    });
  } catch (e) {
    // gagal dibaca: hapus berkas dan barisnya supaya struk yang sama bisa dicoba lagi
    await cleanup(db, row.id, path);
    if (e instanceof ModelError) {
      console.error('[receipt] Gemini gagal membaca struk:', e.reason, '|', e.detail);
      return { status: 'offline', message: `Ra tidak bisa membaca struk sekarang (${OFFLINE[e.reason]}). Coba lagi nanti atau catat manual.` };
    }
    console.error('[receipt] hasil baca tidak valid:', e);
    return { status: 'unreadable', message: 'Ra tidak bisa memahami isi struk ini. Foto ulang lebih jelas atau catat manual.' };
  }
  await db.from('receipts').update({ extracted: extraction }).eq('id', row.id);

  const convId = await ensureConversation(db, input.conversationId, 'receipt', `Struk ${extraction.merchant ?? input.fileName ?? ''}`.trim());
  const proposal = await proposeFromReceipt(ctx, row.id, extraction, convId);
  const reply = proposal.kind === 'proposed' ? `Struk terbaca: ${proposal.summary}` : proposal.message;
  await insertMessages(db, [
    { conversation_id: convId, role: 'user', content: { role: 'user', parts: [{ text: `[struk${input.fileName ? `: ${input.fileName}` : ''}]` }] } },
    { conversation_id: convId, role: 'model', content: { role: 'model', parts: [{ text: reply }] } },
  ]);
  if (proposal.kind === 'unreadable') {
    await db.from('receipts').update({ status: 'rejected' }).eq('id', row.id);
    return { status: 'unreadable', message: proposal.message, receipt_id: row.id };
  }
  const cards = await loadCards(db, [proposal.action_id], lookups, ctx.today);
  const url = await signedReceiptUrl(db, path);
  return {
    status: 'proposed', conversation_id: convId, receipt_id: row.id, reply, lookups,
    proposed_actions: cards.map((c) => ({ ...c, receipt_url: url, receipt_mime: input.mime })),
  };
}
