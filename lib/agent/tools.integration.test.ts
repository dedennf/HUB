// Uji integrasi tools terhadap Supabase sungguhan (lokal). Dilewati bila env tidak ada.
// KOMPAS_IT_URL=http://127.0.0.1:54321 KOMPAS_IT_ANON=... KOMPAS_IT_SERVICE=... npx vitest run lib/agent/tools.integration.test.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { todayIso } from '../time';
import { callTool, commitTool, undo, type CallResult } from './executor';
import type { ToolCtx, UndoPayload } from './tools/types';

const URL = process.env.KOMPAS_IT_URL;
const ANON = process.env.KOMPAS_IT_ANON;
const SERVICE = process.env.KOMPAS_IT_SERVICE;
const run = !!(URL && ANON && SERVICE);

describe.skipIf(!run)('tools di Supabase sungguhan', () => {
  let admin: SupabaseClient;
  let db: SupabaseClient;
  let other: SupabaseClient;
  const users: string[] = [];
  let ctx: ToolCtx;
  const acc: Record<string, string> = {};

  async function login(email: string): Promise<SupabaseClient> {
    const password = `Uji-${Math.random().toString(36).slice(2)}-Aa1!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    users.push(data.user.id);
    const c = createClient(URL!, ANON!, { auth: { persistSession: false } });
    const s = await c.auth.signInWithPassword({ email, password });
    if (s.error) throw s.error;
    return c;
  }
  const balance = async (name: string) => (await db.from('accounts').select('balance').eq('id', acc[name]).single()).data!.balance as number;
  const consistent = async () => ((await db.rpc('check_account_balances')).data as { stored: number; computed: number }[]).every((r) => r.stored === r.computed);
  async function write(name: string, args: unknown): Promise<{ data: Record<string, unknown>; undo: UndoPayload; call: CallResult }> {
    const call = await callTool(ctx, name, args);
    if (call.kind !== 'proposal') throw new Error(`${name}: ${JSON.stringify(call)}`);
    const res = await commitTool(ctx, name, call.resolved);
    if (!res.ok) throw new Error(`${name} commit: ${res.error}`);
    return { data: res.data, undo: res.undo, call };
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
    const stamp = Date.now();
    db = await login(`uji-tools-${stamp}@example.com`);
    other = await login(`uji-lain-${stamp}@example.com`);
    await db.rpc('bootstrap_user');
    for (const [name, type, opening, aliases] of [['BCA', 'bank', 1_000_000, ['atm biru']], ['BRI', 'bank', 500_000, ['atm kuning']], ['GoPay', 'ewallet', 100_000, []], ['Tunai', 'cash', 50_000, []]] as const) {
      const { data } = await db.from('accounts').insert({ name, type, opening_balance: opening, aliases }).select('id').single();
      acc[name] = data!.id;
    }
    ctx = { db, today: todayIso(), now: new Date() };
  });

  afterAll(async () => {
    for (const id of users) await admin.auth.admin.deleteUser(id);
  });

  it('add_transaction: usulan tidak mengubah data, commit mengurangi saldo, undo mengembalikan', async () => {
    const call = await callTool(ctx, 'add_transaction', { kind: 'expense', amount: '30rb', account: 'gopay', merchant: 'Pertamina', note: 'bensin' });
    expect(call).toMatchObject({ kind: 'proposal', permission: 'write' });
    if (call.kind !== 'proposal') return;
    expect(call.summary).toBe('Pengeluaran Rp30.000 · Transportasi · GoPay');
    expect(await balance('GoPay')).toBe(100_000);
    const res = await commitTool(ctx, 'add_transaction', call.resolved);
    expect(res.ok).toBe(true);
    expect(await balance('GoPay')).toBe(70_000);
    if (res.ok) await undo(ctx, res.undo);
    expect(await balance('GoPay')).toBe(100_000);
  });

  it('update_transaction dan undo menjaga saldo', async () => {
    const t = await write('add_transaction', { kind: 'expense', amount: 25_000, account: 'BCA', category: 'Makan' });
    expect(await balance('BCA')).toBe(975_000);
    const u = await write('update_transaction', { id: t.data.id, amount: 40_000, account: 'atm kuning' });
    expect(u.call.kind === 'proposal' && u.call.permission).toBe('destructive');
    expect(await balance('BCA')).toBe(1_000_000);
    expect(await balance('BRI')).toBe(460_000);
    await undo(ctx, u.undo);
    expect(await balance('BCA')).toBe(975_000);
    expect(await balance('BRI')).toBe(500_000);
    await undo(ctx, t.undo);
    expect(await balance('BCA')).toBe(1_000_000);
    expect(await consistent()).toBe(true);
  });

  it('delete_transaction lalu undo memulihkan baris dengan id sama dan saldo', async () => {
    const t = await write('add_transaction', { kind: 'income', amount: 200_000, account: 'BCA', category: 'Gaji' });
    expect(await balance('BCA')).toBe(1_200_000);
    const d = await write('delete_transaction', { id: t.data.id });
    expect(await balance('BCA')).toBe(1_000_000);
    await undo(ctx, d.undo);
    expect(await balance('BCA')).toBe(1_200_000);
    expect((await db.from('transactions').select('id').eq('id', t.data.id)).data).toHaveLength(1);
    await undo(ctx, t.undo);
    expect(await balance('BCA')).toBe(1_000_000);
  });

  it('add_transfer dengan biaya admin: bukan pengeluaran, admin terpisah, undo keduanya', async () => {
    const t = await write('add_transfer', { amount: 200_000, from_account: 'BCA', to_account: 'tunai', fee: 2_500 });
    expect(await balance('BCA')).toBe(797_500);
    expect(await balance('Tunai')).toBe(250_000);
    const rows = (await db.from('transactions').select('kind,amount,group_id').eq('group_id', t.data.group_id as string)).data!;
    expect(rows.map((r) => `${r.kind}:${r.amount}`).sort()).toEqual(['expense:2500', 'transfer:200000']);
    await undo(ctx, t.undo);
    expect(await balance('BCA')).toBe(1_000_000);
    expect(await balance('Tunai')).toBe(50_000);
    expect(await consistent()).toBe(true);
  });

  it('resolusi nama: alias, ambigu, tidak ditemukan, akun ditebak ditandai', async () => {
    expect(await callTool(ctx, 'get_balances', { account_ids: ['atm biru'] })).toMatchObject({ kind: 'read', data: { accounts: [{ name: 'BCA', balance: 1_000_000 }] } });
    const amb = await callTool(ctx, 'add_transaction', { kind: 'expense', amount: 5000, account: 'atm' });
    expect(amb).toMatchObject({ kind: 'error', field: 'account' });
    if (amb.kind === 'error') expect(amb.candidates!.map((c) => c.label).sort()).toEqual(['BCA (bank)', 'BRI (bank)']);
    expect(await callTool(ctx, 'add_transaction', { kind: 'expense', amount: 5000, account: 'Mandiri' })).toMatchObject({ kind: 'error', error: expect.stringContaining('tidak ditemukan') });
    const guess = await callTool(ctx, 'add_transaction', { kind: 'expense', amount: 5000, merchant: 'kopi' });
    expect(guess).toMatchObject({ kind: 'proposal', doubtful: ['account'] });
  });

  it('aturan merchant di memori menentukan kategori', async () => {
    const m = await write('remember', { kind: 'merchant_rule', key: 'Indomaret', value: { category: 'Kebutuhan harian' } });
    const call = await callTool(ctx, 'add_transaction', { kind: 'expense', amount: 12000, account: 'BCA', merchant: 'Indomaret Setiabudi' });
    expect(call.kind === 'proposal' && call.summary).toBe('Pengeluaran Rp12.000 · Kebutuhan harian · BCA');
    await undo(ctx, m.undo);
  });

  it('remember alias lalu dipakai resolusi', async () => {
    const m = await write('remember', { kind: 'alias', key: 'dompet hijau', value: { account: 'GoPay' } });
    const call = await callTool(ctx, 'add_transaction', { kind: 'expense', amount: 9000, account: 'dompet hijau' });
    expect(call.kind === 'proposal' && call.summary).toContain('GoPay');
    await undo(ctx, m.undo);
    expect((await callTool(ctx, 'add_transaction', { kind: 'expense', amount: 9000, account: 'dompet hijau' })).kind).toBe('error');
  });

  it('kuliah: add_course dengan jadwal, add_task, complete_task, undo', async () => {
    await db.from('semesters').insert({ name: 'Semester 7', number: 7, is_active: true });
    const c = await write('add_course', { name: 'Statistika Spasial', alias: 'STAT', credits: 3, schedules: [{ weekday: 'senin', start_time: '08:00', end_time: '09:40', location: 'B2' }] });
    expect((await db.from('course_schedules').select('weekday').eq('course_id', c.data.id as string)).data).toEqual([{ weekday: 1 }]);
    const t = await write('add_task', { title: 'Laporan 1', course: 'stat', due_at: '2026-12-04' });
    expect(t.call.kind === 'proposal' && t.call.summary).toContain('tenggat 2026-12-04 23.59');
    const done = await write('complete_task', { title: 'laporan 1' });
    expect((await db.from('tasks').select('status').eq('id', t.data.id as string).single()).data!.status).toBe('done');
    await undo(ctx, done.undo);
    expect((await db.from('tasks').select('status').eq('id', t.data.id as string).single()).data!.status).toBe('todo');
    await undo(ctx, t.undo);
    await undo(ctx, c.undo);
    expect((await db.from('course_schedules').select('id').eq('course_id', c.data.id as string)).data).toHaveLength(0);
  });

  it('riset, kalender, bahasa, otomasi', async () => {
    await db.from('research_projects').insert({ title: 'Skripsi' });
    const tg = await write('add_research_target', { title: 'Draf Bab II', due_date: '2026-12-15' });
    await write('update_research_progress', { target: 'bab ii', progress: 40 });
    expect((await callTool(ctx, 'get_research_progress', {})) as { data: { targets: { progress: number }[] } }).toMatchObject({ data: { targets: [{ progress: 40 }] } });
    await undo(ctx, tg.undo);
    const ev = await write('add_event', { title: 'Rapat', start_at: '2026-12-02T14:00', location: 'Perpus' });
    const cal = await callTool(ctx, 'get_calendar', { from: '2026-12-02', to: '2026-12-02' });
    expect(JSON.stringify(cal)).toContain('Rapat');
    await undo(ctx, ev.undo);
    const v = await write('save_vocab', { term: 'outcrop', meaning_id: 'singkapan' });
    const g = await write('grade_review', { vocab_id: v.data.id, grade: 4 });
    expect(g.data).toMatchObject({ repetitions: 1, interval_days: 1 });
    await undo(ctx, g.undo);
    expect((await db.from('vocab').select('repetitions').eq('id', v.data.id as string).single()).data!.repetitions).toBe(0);
    const a = await write('create_automation', { name: 'Bayar wifi', trigger: { type: 'schedule', cron: '0 8 5 * *' }, action: { type: 'add_transaction', args: { kind: 'expense', amount: 150000, account: 'GoPay' } }, mode: 'rule', auto_write: true });
    expect(a.call.kind === 'proposal' && a.call.summary).toContain('Otomatis tanpa konfirmasi: Ya');
    const del = await write('delete_automation', { automation_id: 'bayar wifi' });
    expect((await callTool(ctx, 'list_automations', {})) as { data: unknown[] }).toMatchObject({ data: [] });
    await undo(ctx, del.undo);
    expect(((await callTool(ctx, 'list_automations', {})) as { data: unknown[] }).data).toHaveLength(1);
    expect(await callTool(ctx, 'create_automation', { name: 'x', trigger: { type: 'event', event: 'transaction.created' }, action: { type: 'add_transaction', args: {} }, mode: 'agent' })).toMatchObject({ kind: 'error' });
  });

  it('RLS: pengguna lain tidak melihat dan tidak bisa memakai akun pemilik', async () => {
    const octx: ToolCtx = { db: other, today: ctx.today, now: ctx.now };
    expect(await callTool(octx, 'get_balances', {})).toMatchObject({ kind: 'read', data: { accounts: [], ready_money: 0 } });
    expect((await callTool(octx, 'add_transaction', { kind: 'expense', amount: 1000, account: acc.BCA })).kind).toBe('error');
    expect(await consistent()).toBe(true);
  });
});
