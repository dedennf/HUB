// Uji integrasi loop agen (Fase 3) dengan model palsu terhadap Supabase lokal. Dilewati bila env tidak ada.
// KOMPAS_IT_URL=http://127.0.0.1:54321 KOMPAS_IT_ANON=... KOMPAS_IT_SERVICE=... npm run test:it
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, isoWeekday, todayIso } from '../time';
import { approveActions, rejectActions, undoActions } from './actions';
import { ModelError, type AgentModel, type FunctionCallOut, type ModelRequest, type ModelTurn } from './model';
import { handleMessage, overRateLimit } from './service';
import type { ToolCtx } from './tools/types';

const URL = process.env.KOMPAS_IT_URL;
const ANON = process.env.KOMPAS_IT_ANON;
const SERVICE = process.env.KOMPAS_IT_SERVICE;
const run = !!(URL && ANON && SERVICE);

/** Model palsu: tiap giliran dijawab oleh fungsi skenario, semua permintaan dicatat. */
class FakeModel implements AgentModel {
  readonly name = 'fake';
  requests: ModelRequest[] = [];
  constructor(private script: (req: ModelRequest, step: number) => { calls?: FunctionCallOut[]; text?: string }) {}
  async generate(req: ModelRequest): Promise<ModelTurn> {
    this.requests.push(structuredClone({ ...req, signal: undefined }));
    const out = this.script(req, this.requests.length - 1);
    const calls = (out.calls ?? []).map((c, i) => ({ ...c, id: c.id ?? `call-${this.requests.length}-${i}` }));
    return {
      content: { role: 'model', parts: calls.length ? calls.map((c) => ({ functionCall: { id: c.id, name: c.name, args: c.args } })) : [{ text: out.text ?? '' }] },
      functionCalls: calls, text: out.text ?? '',
    };
  }
}
/** Skenario umum: giliran pertama memanggil tool, giliran berikutnya menjawab teks. */
const once = (calls: FunctionCallOut[], text = 'Cek dulu sebelum disimpan.') => new FakeModel((_r, step) => (step === 0 ? { calls } : { text }));

describe.skipIf(!run)('loop agen dengan model palsu', () => {
  let admin: SupabaseClient;
  let db: SupabaseClient;
  const users: string[] = [];
  const acc: Record<string, string> = {};
  const cat: Record<string, string> = {};
  const ctx = (): ToolCtx => ({ db, today: todayIso(), now: new Date() });
  const balance = async (name: string) => (await db.from('accounts').select('balance').eq('id', acc[name]).single()).data!.balance as number;

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
    const email = `uji-agen-${Date.now()}@example.com`;
    const password = `Uji-${Math.random().toString(36).slice(2)}-Aa1!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    users.push(data.user.id);
    db = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await db.auth.signInWithPassword({ email, password });
    await db.rpc('bootstrap_user');
    for (const [name, type, opening, aliases] of [['BCA', 'bank', 1_000_000, []], ['Dana', 'ewallet', 50_000, []], ['GoPay', 'ewallet', 100_000, ['gopay']], ['Tunai', 'cash', 80_000, ['cash']]] as const) {
      const { data: a } = await db.from('accounts').insert({ name, type, opening_balance: opening, aliases }).select('id').single();
      acc[name] = a!.id;
    }
    const { data: cats } = await db.from('categories').select('id,name').eq('kind', 'expense');
    for (const c of cats ?? []) cat[c.name] = c.id;
    const { data: sem } = await db.from('semesters').insert({ name: 'Uji: Semester', is_active: true }).select('id').single();
    await db.from('courses').insert({ name: 'Rencana Detail Tata Ruang', alias: 'RDTR', semester_id: sem!.id });
  });

  afterAll(async () => {
    for (const id of users) await admin.auth.admin.deleteUser(id);
  });

  it('"bensin 30rb pakai gopay terus makan siang 25 ribu cash": dua usulan, saldo tetap sampai disetujui, undo mengembalikan', async () => {
    const model = once([
      { name: 'add_transaction', args: { kind: 'expense', amount: 30000, account: 'gopay', note: 'bensin' } },
      { name: 'add_transaction', args: { kind: 'expense', amount: 25000, account: 'cash', note: 'makan siang', category: 'Makan' } },
    ], 'Oke, ada 2 pengeluaran. Cek dulu sebelum disimpan.');
    const r = await handleMessage(ctx(), model, 'tadi beli bensin 30rb pakai gopay terus makan siang 25 ribu cash', null);
    expect(r.offline).toBeNull();
    expect(r.proposed_actions).toHaveLength(2);
    expect(r.proposed_actions[0]).toMatchObject({ tool: 'add_transaction', icon: 'expense', value: 'Rp30.000', status: 'proposed' });
    expect(r.proposed_actions[0].chips.map((c) => c.label)).toEqual(['Transportasi', 'GoPay', 'Hari ini']);
    expect(r.proposed_actions[1].chips[1].label).toBe('Tunai');
    // Gemini menerima status menunggu konfirmasi, bukan hasil eksekusi
    const toolTurn = model.requests[1].contents.at(-1)!;
    expect(toolTurn.parts?.[0].functionResponse?.response).toMatchObject({ status: 'menunggu_konfirmasi', action_id: r.proposed_actions[0].id });
    expect(await balance('GoPay')).toBe(100_000);
    expect(await balance('Tunai')).toBe(80_000);

    const ids = r.proposed_actions.map((a) => a.id);
    const ok = await approveActions(ctx(), ids);
    expect(ok.ok).toBe(true);
    expect(await balance('GoPay')).toBe(70_000);
    expect(await balance('Tunai')).toBe(55_000);
    const { data: rows } = await db.from('agent_actions').select('status,undo_payload').in('id', ids);
    expect(rows!.every((x) => x.status === 'executed' && x.undo_payload)).toBe(true);

    const u = await undoActions(ctx(), ids);
    expect(u.ok).toBe(true);
    expect(await balance('GoPay')).toBe(100_000);
    expect(await balance('Tunai')).toBe(80_000);
    // riwayat percakapan tersimpan: user, model (call), tool, model (teks)
    const { data: msgs } = await db.from('agent_messages').select('role').eq('conversation_id', r.conversation_id).order('created_at');
    expect(msgs!.map((m) => m.role)).toEqual(['user', 'model', 'tool', 'model']);
  });

  it('"tugas laporan RDTR dikumpul jumat jam 23.59": tugas dengan mata kuliah dan tenggat', async () => {
    const friday = addDays(todayIso(), ((5 - isoWeekday(todayIso()) + 7) % 7) || 7);
    const model = once([{ name: 'add_task', args: { title: 'Laporan RDTR', course: 'RDTR', due_at: `${friday}T23:59` } }]);
    const r = await handleMessage(ctx(), model, 'tugas laporan RDTR dikumpul jumat jam 23.59', null);
    expect(r.proposed_actions).toHaveLength(1);
    const card = r.proposed_actions[0];
    expect(card).toMatchObject({ icon: 'task', kindLabel: 'Tugas baru', value: 'Laporan RDTR' });
    expect(card.chips[0].label).toBe('Rencana Detail Tata Ruang');
    expect(card.chips[1].label).toMatch(/23\.59$/);
    await approveActions(ctx(), [card.id]);
    const { data: t } = await db.from('tasks').select('title,course_id').eq('title', 'Laporan RDTR').single();
    expect(t!.course_id).toBeTruthy();
  });

  it('"pindahin 500rb dari BCA ke Dana": transfer memindahkan saldo setelah disetujui', async () => {
    const model = once([{ name: 'add_transfer', args: { amount: 500000, from_account: 'BCA', to_account: 'Dana' } }]);
    const r = await handleMessage(ctx(), model, 'pindahin 500rb dari BCA ke Dana', null);
    expect(r.proposed_actions[0]).toMatchObject({ icon: 'transfer', value: 'Rp500.000' });
    expect(r.proposed_actions[0].chips.slice(0, 2).map((c) => c.label)).toEqual(['BCA', 'ke Dana']);
    await approveActions(ctx(), [r.proposed_actions[0].id]);
    expect(await balance('BCA')).toBe(500_000);
    expect(await balance('Dana')).toBe(550_000);
  });

  it('"sisa uang di semua akun berapa": tool baca langsung dijalankan, tanpa usulan', async () => {
    const model = new FakeModel((req, step) => {
      if (step === 0) return { calls: [{ name: 'get_balances', args: {} }] };
      const res = req.contents.at(-1)!.parts![0].functionResponse!.response as { result: { ready_money: number } };
      return { text: `Total siap pakai ${JSON.stringify(res.result)}` };
    });
    const r = await handleMessage(ctx(), model, 'sisa uang di semua akun berapa', null);
    expect(r.proposed_actions).toHaveLength(0);
    expect(model.requests).toHaveLength(2);
    expect(r.reply).toContain('BCA');
    expect(r.reply).toContain('500000');
  });

  it('koreksi pengguna disimpan ke memori dan dipakai di permintaan berikutnya', async () => {
    // Ra salah tebak kategori dan akun, pengguna mengganti lewat chip
    const first = once([{ name: 'add_transaction', args: { kind: 'expense', amount: 15000, note: 'pak ujang' } }]);
    const r1 = await handleMessage(ctx(), first, 'titip pak ujang 15rb', null);
    const card = r1.proposed_actions[0];
    expect(card.chips[0].doubtful).toBe(true);
    const target = cat['Rumah Tangga'] ?? Object.values(cat).find((id) => id !== card.chips[0].value)!;
    const ok = await approveActions(ctx(), [card.id], { [card.id]: { category: target, account: acc.Dana } });
    expect(ok.ok).toBe(true);
    const { data: mem } = await db.from('agent_memory').select('kind,key,value').eq('key', 'pak ujang');
    expect(mem).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'merchant_rule', value: { category_id: target } }),
      expect.objectContaining({ kind: 'correction', value: { account_id: acc.Dana } }),
    ]));

    // permintaan berikutnya: memori masuk konteks sistem, dan tool memakai kategori serta akun hasil koreksi
    const second = once([{ name: 'add_transaction', args: { kind: 'expense', amount: 20000, note: 'pak ujang' } }]);
    const r2 = await handleMessage(ctx(), second, 'titip pak ujang lagi 20rb', r1.conversation_id);
    expect(second.requests[0].system).toMatch(/merchant_rule "pak ujang"/);
    const c2 = r2.proposed_actions[0];
    expect(c2.chips[0]).toMatchObject({ value: target, doubtful: false });
    expect(c2.chips[1]).toMatchObject({ label: 'Dana', doubtful: false });
    // riwayat percakapan sebelumnya ikut terkirim
    expect(second.requests[0].contents[0].parts?.[0].text).toBe('titip pak ujang 15rb');
    await rejectActions(ctx(), [c2.id]);
  });

  it('aksi destruktif ditandai dan butuh konfirmasi', async () => {
    const { data: tx } = await db.from('transactions').select('id').eq('kind', 'expense').limit(1).single();
    const model = once([{ name: 'delete_transaction', args: { id: tx!.id } }]);
    const r = await handleMessage(ctx(), model, 'hapus transaksi tadi', null);
    expect(r.proposed_actions[0]).toMatchObject({ destructive: true, icon: 'delete' });
    expect((await db.from('transactions').select('id').eq('id', tx!.id)).data).toHaveLength(1);
    await rejectActions(ctx(), [r.proposed_actions[0].id]);
    expect((await db.from('transactions').select('id').eq('id', tx!.id)).data).toHaveLength(1);
  });

  it('batas langkah: berhenti dengan pesan permintaan terlalu panjang', async () => {
    const model = new FakeModel(() => ({ calls: [{ name: 'get_balances', args: {} }] }));
    const r = await handleMessage(ctx(), model, 'cek terus', null, { maxSteps: 3 });
    expect(model.requests).toHaveLength(3);
    expect(r.reply).toMatch(/terlalu panjang/);
  });

  it('Gemini gagal (kuota) atau belum diatur: pengurai lokal mengusulkan lewat agent_actions', async () => {
    const broken: AgentModel = { name: 'rusak', generate: async () => { throw new ModelError('quota', '429'); } };
    const r = await handleMessage(ctx(), broken, 'kopi 18rb dana', null);
    expect(r.offline).toBe('kuota habis');
    expect(r.proposed_actions[0]).toMatchObject({ tool: 'add_transaction', value: 'Rp18.000' });
    expect(r.proposed_actions[0].chips[1].label).toBe('Dana');
    await rejectActions(ctx(), [r.proposed_actions[0].id]);

    const none = await handleMessage(ctx(), null, 'saldo berapa?', null);
    expect(none.offline).toBe('Gemini belum diatur');
    expect(none.lines?.some((l) => l.startsWith('BCA'))).toBe(true);
  });

  it('galat tak terduga di loop agen: tetap dilayani pengurai lokal', async () => {
    const buggy: AgentModel = { name: 'bug', generate: async () => { throw new TypeError('x is undefined'); } };
    const r = await handleMessage(ctx(), buggy, 'kopi 18rb dana', null);
    expect(r.offline).toBe('galat di server Ra');
    expect(r.proposed_actions[0]).toMatchObject({ value: 'Rp18.000' });
    await rejectActions(ctx(), [r.proposed_actions[0].id]);
  });

  it('Gemini terlalu lama: dihentikan oleh batas waktu lalu pengurai lokal', async () => {
    const slow: AgentModel = {
      name: 'lambat',
      generate: (req) => new Promise((_, reject) => req.signal?.addEventListener('abort', () => reject(new ModelError('timeout', 'lambat')))),
    };
    const t0 = Date.now();
    const r = await handleMessage(ctx(), slow, 'saldo berapa?', null, { budgetMs: 300 });
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(r.offline).toBe('Gemini terlalu lama menjawab');
    expect(r.lines?.length).toBeGreaterThan(0);
  });

  it('batas laju 30 pesan per menit', async () => {
    const { data: conv } = await db.from('agent_conversations').insert({ channel: 'text' }).select('id').single();
    await db.from('agent_messages').insert(Array.from({ length: 30 }, () => ({ conversation_id: conv!.id, role: 'user', content: { role: 'user', parts: [{ text: 'x' }] } })));
    expect(await overRateLimit(ctx())).toBe(true);
  });
});
