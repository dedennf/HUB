// Uji integrasi alur struk (Fase 4) dengan model tiruan, Supabase lokal termasuk Storage. Dilewati bila env tidak ada.
// KOMPAS_IT_URL=http://127.0.0.1:54321 KOMPAS_IT_ANON=... KOMPAS_IT_SERVICE=... npm run test:it
import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { approveActions, rejectActions, undoActions } from '@/lib/agent/actions';
import { ModelError, type AgentModel, type ModelRequest } from '@/lib/agent/model';
import type { ToolCtx } from '@/lib/agent/tools/types';
import { todayIso } from '@/lib/time';
import { handleReceiptUpload, type ReceiptResult } from './service';

const URL = process.env.KOMPAS_IT_URL;
const ANON = process.env.KOMPAS_IT_ANON;
const SERVICE = process.env.KOMPAS_IT_SERVICE;
const run = !!(URL && ANON && SERVICE);

/** Model tiruan: mengembalikan JSON ekstraksi yang ditentukan uji, mencatat permintaan. */
class FakeVision implements AgentModel {
  readonly name = 'fake-vision';
  requests: ModelRequest[] = [];
  constructor(private out: Record<string, unknown> | Error) {}
  async generate(req: ModelRequest) {
    this.requests.push(req);
    if (this.out instanceof Error) throw this.out;
    const text = JSON.stringify(this.out);
    return { content: { role: 'model', parts: [{ text }] }, functionCalls: [], text };
  }
}
/** Model tiruan D-72: ekstraksi menjawab "other", lalu loop Ra memanggil add_task, lalu menutup dengan teks. */
class FakeTaskReader implements AgentModel {
  readonly name = 'fake-task-reader';
  requests: ModelRequest[] = [];
  async generate(req: ModelRequest) {
    this.requests.push(req);
    if (req.json) {
      const text = JSON.stringify({ doc_type: 'other', total: null, confidence: 1 });
      return { content: { role: 'model' as const, parts: [{ text }] }, functionCalls: [], text };
    }
    const answered = req.contents.some((c) => c.parts?.some((p) => p.functionResponse));
    if (!answered) {
      const call = { name: 'add_task', args: { title: 'Laporan praktikum LiDAR', due_at: `${todayIso()}T23:59`, kind: 'assignment' } };
      return { content: { role: 'model' as const, parts: [{ functionCall: call }] }, functionCalls: [call], text: '' };
    }
    return { content: { role: 'model' as const, parts: [{ text: 'Ada satu tugas di screenshot ini.' }] }, functionCalls: [], text: 'Ada satu tugas di screenshot ini.' };
  }
}
const PNG = (seed: string) => Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from(seed)]);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const nowLocal = () => `${todayIso()}T10:15`;

describe.skipIf(!run)('struk: unggah, baca, usulan, konfirmasi', () => {
  let admin: SupabaseClient;
  let db: SupabaseClient;
  let other: SupabaseClient;
  let userId = '';
  const users: string[] = [];
  const acc: Record<string, string> = {};
  const cat: Record<string, string> = {};
  const ctx = (): ToolCtx => ({ db, today: todayIso(), now: new Date() });
  const balance = async (n: string) => (await db.from('accounts').select('balance').eq('id', acc[n]).single()).data!.balance as number;
  const upload = (model: AgentModel | null, data: Buffer, mime = 'image/png') =>
    handleReceiptUpload(ctx(), model, { userId, data, mime, hash: sha(data), fileName: 'struk.png', conversationId: null });
  const proposed = (r: ReceiptResult) => {
    if (r.status !== 'proposed') throw new Error(`harusnya proposed: ${JSON.stringify(r)}`);
    return r;
  };

  async function login(email: string) {
    const password = `Uji-${Math.random().toString(36).slice(2)}-Aa1!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    users.push(data.user.id);
    const c = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password });
    return { c, id: data.user.id };
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
    const stamp = Date.now();
    const me = await login(`uji-struk-${stamp}@example.com`);
    db = me.c; userId = me.id;
    other = (await login(`uji-struk-lain-${stamp}@example.com`)).c;
    await db.rpc('bootstrap_user');
    for (const [name, type, opening, aliases] of [['BCA', 'bank', 1_000_000, ['bca']], ['Dana', 'ewallet', 50_000, []], ['GoPay', 'ewallet', 100_000, ['gopay']]] as const) {
      const { data } = await db.from('accounts').insert({ name, type, opening_balance: opening, aliases }).select('id').single();
      acc[name] = data!.id;
    }
    for (const c of (await db.from('categories').select('id,name').eq('kind', 'expense')).data ?? []) cat[c.name] = c.id;
  });

  afterAll(async () => {
    for (const id of users) await admin.auth.admin.deleteUser(id);
  });

  it('struk belanja: tersimpan privat, usulan pengeluaran, disetujui → transaksi bersumber struk', async () => {
    const model = new FakeVision({ doc_type: 'receipt', merchant: 'Indomaret Setiabudi', occurred_at: nowLocal(), total: 25500, payment_method: 'GoPay', category_hint: 'Makan', items: [{ name: 'Roti' }, { name: 'Susu' }], confidence: 0.92 });
    const img = PNG('belanja-1');
    const r = proposed(await upload(model, img));
    // gambar dikirim ke Gemini sebagai inlineData dan meminta JSON
    expect(model.requests[0].json).toBeTruthy();
    expect(model.requests[0].contents[0].parts?.[0].inlineData?.mimeType).toBe('image/png');
    expect(model.requests[0].system).toMatch(/GoPay/);
    const card = r.proposed_actions[0];
    expect(card).toMatchObject({ tool: 'add_transaction', value: 'Rp25.500', receipt_mime: 'image/png' });
    expect(card.chips.map((c) => c.label).slice(0, 2)).toEqual(['Makan & minum', 'GoPay']);
    expect(card.receipt_url).toMatch(/\/storage\/v1\/object\/sign\/receipts\//);
    expect(card.note).toMatch(/Indomaret/);
    expect(await balance('GoPay')).toBe(100_000);

    // berkas privat: pengguna lain tidak bisa melihatnya
    const { data: mine } = await db.storage.from('receipts').list(userId);
    expect(mine?.map((f) => f.name)).toContain(`${sha(img)}.png`);
    const { data: theirs } = await other.storage.from('receipts').list(userId);
    expect(theirs ?? []).toHaveLength(0);

    expect((await approveActions(ctx(), [card.id])).ok).toBe(true);
    expect(await balance('GoPay')).toBe(74_500);
    const { data: tx } = await db.from('transactions').select('source,receipt_id,merchant').eq('receipt_id', r.receipt_id).single();
    expect(tx).toMatchObject({ source: 'receipt', merchant: 'Indomaret Setiabudi' });
    expect((await db.from('receipts').select('status').eq('id', r.receipt_id).single()).data!.status).toBe('confirmed');
  });

  it('struk yang sama diunggah dua kali ditolak, dengan tautan ke transaksinya', async () => {
    const model = new FakeVision({ doc_type: 'receipt', total: 1, confidence: 1 });
    const r = await upload(model, PNG('belanja-1'));
    expect(r.status).toBe('duplicate');
    if (r.status !== 'duplicate') return;
    expect(r.message).toMatch(/sudah pernah dicatat/);
    expect(r.transaction?.href).toMatch(/^\/keuangan\/transaksi\//);
    expect(model.requests).toHaveLength(0);
  });

  it('bukti transfer antar akun sendiri → transfer, bukan pengeluaran', async () => {
    const before = { BCA: await balance('BCA'), Dana: await balance('Dana') };
    const model = new FakeVision({ doc_type: 'transfer_proof', from_account_hint: 'BCA', to_account_hint: 'DANA', total: 200000, occurred_at: nowLocal(), confidence: 0.95 });
    const r = proposed(await upload(model, PNG('transfer-1')));
    expect(r.proposed_actions[0]).toMatchObject({ tool: 'add_transfer', icon: 'transfer', value: 'Rp200.000' });
    await approveActions(ctx(), [r.proposed_actions[0].id]);
    expect(await balance('BCA')).toBe(before.BCA - 200_000);
    expect(await balance('Dana')).toBe(before.Dana + 200_000);
    const { data: tx } = await db.from('transactions').select('kind,source').eq('receipt_id', r.receipt_id).single();
    expect(tx).toEqual({ kind: 'transfer', source: 'receipt' });
  });

  it('transfer ke pihak lain tetap pengeluaran dari akun asal', async () => {
    const model = new FakeVision({ doc_type: 'transfer_proof', from_account_hint: 'BCA', to_account_hint: 'Budi Santoso', total: 75000, confidence: 0.9 });
    const r = proposed(await upload(model, PNG('transfer-2')));
    expect(r.proposed_actions[0]).toMatchObject({ tool: 'add_transaction', icon: 'expense' });
    expect(r.proposed_actions[0].chips[1].label).toBe('BCA');
    await rejectActions(ctx(), [r.proposed_actions[0].id]);
  });

  it('keyakinan rendah: nominal dan tanggal ditandai, nominal bisa dikoreksi sebelum disetujui', async () => {
    const model = new FakeVision({ doc_type: 'receipt', merchant: 'Warung Bu Sri', total: 18000, payment_method: 'tunai', confidence: 0.4 });
    const r = proposed(await upload(model, PNG('buram-1')));
    const card = r.proposed_actions[0];
    expect(card.warn).toBe(true);
    expect(card.note).toMatch(/kurang jelas/);
    expect(card.chips.find((c) => c.field === 'amount')).toMatchObject({ doubtful: true, edit: 'amount', value: '18000' });
    await approveActions(ctx(), [card.id], { [card.id]: { amount: '23000', account: acc.Dana } });
    const { data: tx } = await db.from('transactions').select('amount,account_id').eq('receipt_id', r.receipt_id).single();
    expect(tx).toEqual({ amount: 23000, account_id: acc.Dana });
  });

  it('merchant rule di memori mengalahkan tebakan kategori Gemini', async () => {
    const target = cat['Rumah Tangga'] ?? Object.values(cat).find((id) => id !== cat['Makan & minum'])!;
    await db.from('agent_memory').insert({ kind: 'merchant_rule', key: 'alfamart', value: { category_id: target } });
    const model = new FakeVision({ doc_type: 'receipt', merchant: 'Alfamart', total: 40000, payment_method: 'BCA', category_hint: 'Makan', confidence: 0.9 });
    const r = proposed(await upload(model, PNG('alfa-1')));
    expect(r.proposed_actions[0].chips[0].value).toBe(target);
    await rejectActions(ctx(), [r.proposed_actions[0].id]);
  });

  it('ditolak atau di-undo: struk boleh diunggah ulang', async () => {
    // "alfa-1" ditolak di uji sebelumnya
    const again = await upload(new FakeVision({ doc_type: 'receipt', merchant: 'Alfamart', total: 40000, confidence: 0.9 }), PNG('alfa-1'));
    expect(again.status).toBe('proposed');
    if (again.status !== 'proposed') return;
    await approveActions(ctx(), [again.proposed_actions[0].id]);
    await undoActions(ctx(), [again.proposed_actions[0].id]);
    expect((await db.from('receipts').select('status').eq('id', again.receipt_id).single()).data!.status).toBe('rejected');
    const third = await upload(new FakeVision({ doc_type: 'receipt', merchant: 'Alfamart', total: 40000, confidence: 0.9 }), PNG('alfa-1'));
    expect(third.status).toBe('proposed');
    if (third.status === 'proposed') await rejectActions(ctx(), [third.proposed_actions[0].id]);
  });

  it('total tidak terbaca: tidak ada usulan, pesan isi manual', async () => {
    const r = await upload(new FakeVision({ doc_type: 'unknown', total: null, confidence: 0.2 }), PNG('kosong-1'));
    expect(r).toMatchObject({ status: 'unreadable' });
    expect((r as { message: string }).message).toMatch(/Catat manual/);
  });

  it('Gemini gagal: berkas dan baris struk dibersihkan, bisa dicoba lagi', async () => {
    const img = PNG('kuota-1');
    const r = await upload(new FakeVision(new ModelError('quota', 'habis', 'ApiError 429')), img);
    expect(r).toMatchObject({ status: 'offline' });
    expect((r as { message: string }).message).toMatch(/kuota Gemini habis/);
    expect((await db.from('receipts').select('id').eq('image_hash', sha(img))).data).toHaveLength(0);
    const { data: files } = await db.storage.from('receipts').list(userId);
    expect(files?.map((f) => f.name)).not.toContain(`${sha(img)}.png`);
    expect((await upload(new FakeVision({ doc_type: 'receipt', total: 5000, confidence: 0.9 }), img)).status).toBe('proposed');
  });

  it('screenshot tugas (bukan struk): diteruskan ke Ra, usulan tugas, tidak tersimpan sebagai struk (D-72)', async () => {
    const model = new FakeTaskReader();
    const img = PNG('tugas-lms-1');
    const r = await upload(model, img);
    if (r.status !== 'agent') throw new Error(`harusnya agent: ${JSON.stringify(r)}`);
    expect(r.reply).toMatch(/satu tugas/);
    expect(r.proposed_actions.map((c) => c.tool)).toEqual(['add_task']);
    // giliran Ra menerima gambar, riwayat hanya menyimpan penanda
    const agentReq = model.requests.find((q) => !q.json)!;
    expect(agentReq.contents.at(-1)!.parts?.[0].inlineData?.mimeType).toBe('image/png');
    expect(agentReq.system).toMatch(/\[gambar\]/);
    const { data: msgs } = await db.from('agent_messages').select('content').eq('conversation_id', r.conversation_id).eq('role', 'user');
    expect(JSON.stringify(msgs)).not.toMatch(/inlineData/);
    // bukan struk: tidak ada baris atau berkas yang tertinggal, jadi bisa ditempel ulang
    expect((await db.from('receipts').select('id').eq('image_hash', sha(img))).data).toEqual([]);
    expect((await db.storage.from('receipts').list(userId)).data?.map((f) => f.name)).not.toContain(`${sha(img)}.png`);
    await rejectActions(ctx(), r.proposed_actions.map((c) => c.id));
  });

  it('gambar dengan pesan langsung ke Ra tanpa ekstraksi struk (D-72)', async () => {
    const model = new FakeTaskReader();
    const r = await handleReceiptUpload(ctx(), model, { userId, data: PNG('tugas-lms-2'), mime: 'image/png', hash: sha(PNG('tugas-lms-2')), conversationId: null, note: 'catat tugas ini' });
    expect(r.status).toBe('agent');
    expect(model.requests.some((q) => q.json)).toBe(false);
    expect(model.requests[0].contents.at(-1)!.parts?.[1].text).toBe('[gambar] catat tugas ini');
    if (r.status === 'agent') await rejectActions(ctx(), r.proposed_actions.map((c) => c.id));
  });

  it('Gemini belum diatur: tidak ada yang tersimpan', async () => {
    const img = PNG('tanpa-model');
    expect(await upload(null, img)).toMatchObject({ status: 'offline' });
    expect((await db.from('receipts').select('id').eq('image_hash', sha(img))).data).toHaveLength(0);
  });
});
