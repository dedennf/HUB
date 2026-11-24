// Uji integrasi mesin otomasi (Fase 6) di Supabase lokal. Dilewati bila env tidak ada.
// KOMPAS_IT_URL=http://127.0.0.1:54321 KOMPAS_IT_ANON=... KOMPAS_IT_SERVICE=... npm run test:it
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callTool, commitTool } from '@/lib/agent/executor';
import type { PushSender } from '@/lib/notify';
import { todayIso } from '@/lib/time';
import { runTick } from './engine';
import { ownerSession } from './session';

const URL = process.env.KOMPAS_IT_URL;
const ANON = process.env.KOMPAS_IT_ANON;
const SERVICE = process.env.KOMPAS_IT_SERVICE;
const run = !!(URL && ANON && SERVICE);

describe.skipIf(!run)('mesin otomasi', () => {
  let admin: SupabaseClient;
  let db: SupabaseClient;
  let email = '';
  let userId = '';
  const acc: Record<string, string> = {};
  let makanId = '';
  const pushed: string[] = [];
  const push: PushSender = async (sub, payload) => {
    if (sub.endpoint.includes('hilang')) return { ok: false, gone: true };
    pushed.push(JSON.parse(payload).title);
    return { ok: true, gone: false };
  };
  const notes = async () => (await db.from('notifications').select('title,dedupe_key,deliver_after,sent_at,body').order('created_at')).data ?? [];
  const due = (key: string) => db.from('automations').update({ next_run_at: new Date(Date.now() - 60_000).toISOString() }).eq('system_key', key);

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
    email = `uji-otomasi-${Date.now()}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    // sesi pemilik persis seperti /api/cron/tick: tautan masuk dari service role, ditukar jadi sesi
    const s = await ownerSession({ url: URL!, anonKey: ANON!, serviceKey: SERVICE!, email });
    db = s.db;
    expect(s.userId).toBe(userId);
    await db.rpc('bootstrap_user');
    // jam tenang dimatikan dulu supaya uji tidak bergantung jam berjalan
    await db.from('settings').upsert({ key: 'quiet_hours', value: ['03:00', '03:01'] }, { onConflict: 'user_id,key' });
    for (const [name, type, opening] of [['BCA', 'bank', 1_000_000], ['GoPay', 'ewallet', 100_000]] as const) {
      const { data: a } = await db.from('accounts').insert({ name, type, opening_balance: opening }).select('id').single();
      acc[name] = a!.id;
    }
    const { data: c } = await db.from('categories').select('id').eq('kind', 'expense').ilike('name', 'Makan%').limit(1).single();
    makanId = c!.id;
    await db.from('categories').update({ monthly_budget: 100_000 }).eq('id', makanId);
    const stamp = Date.now();
    const { error: subErr } = await db.from('push_subscriptions').insert([
      { endpoint: `https://push.example/laptop-${stamp}`, keys: { p256dh: 'x'.repeat(20), auth: 'y'.repeat(8) }, device_label: 'Laptop' },
      { endpoint: `https://push.example/hilang-${stamp}`, keys: { p256dh: 'x'.repeat(20), auth: 'y'.repeat(8) }, device_label: 'HP lama' },
    ]);
    if (subErr) throw subErr;
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it('tick pertama memasang 12 otomasi bawaan, tick berikutnya tidak menggandakan', async () => {
    const r1 = await runTick(db, { push });
    expect(r1.seeded).toBe(12);
    const before = (await db.from('automations').select('system_key,next_run_at').eq('system_key', 'briefing').single()).data!.next_run_at;
    const r2 = await runTick(db, { push });
    expect(r2.seeded).toBe(0);
    // jadwal tidak boleh bergeser hanya karena tick berjalan (jsonb mengubah urutan kunci pemicu)
    expect((await db.from('automations').select('next_run_at').eq('system_key', 'briefing').single()).data!.next_run_at).toBe(before);
    const { data } = await db.from('automations').select('system_key,next_run_at,trigger').not('system_key', 'is', null);
    expect(data).toHaveLength(12);
    const briefing = data!.find((a) => a.system_key === 'briefing')!;
    expect(briefing.trigger).toEqual({ type: 'schedule', cron: '30 6 * * *' });
    expect(new Date(briefing.next_run_at!).getTime()).toBeGreaterThan(Date.now());
  });

  it('klaim aman dari eksekusi ganda: dua tick bersamaan tidak mengambil otomasi yang sama', async () => {
    await db.from('automations').update({ next_run_at: new Date(Date.now() - 60_000).toISOString() }).not('system_key', 'is', null);
    const [a, b] = await Promise.all([db.rpc('claim_due_automations', { lease_seconds: 600 }), db.rpc('claim_due_automations', { lease_seconds: 600 })]);
    const ids = [...(a.data ?? []), ...(b.data ?? [])].map((x: { id: string }) => x.id);
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
  });

  it('pengingat tenggat bertingkat sekali per tahap, tugas lewat tenggat ditandai', async () => {
    const soon = new Date(Date.now() + 20 * 3600_000).toISOString();
    const past = new Date(Date.now() - 3600_000).toISOString();
    await db.from('tasks').insert([{ title: 'Uji: laporan besok', due_at: soon }, { title: 'Uji: kuis kemarin', due_at: past }]);
    await db.from('automation_events').update({ processed_at: new Date().toISOString() }).is('processed_at', null);
    await due('deadlines'); await due('overdue');
    await runTick(db, { push });
    await due('deadlines'); await due('overdue');
    await runTick(db, { push });
    const n = await notes();
    expect(n.filter((x) => x.dedupe_key?.startsWith('deadline:') && x.dedupe_key.endsWith(':h1'))).toHaveLength(1);
    expect(n.filter((x) => x.title === 'Tugas lewat tenggat')).toHaveLength(1);
    const { data: t } = await db.from('tasks').select('status').eq('title', 'Uji: kuis kemarin').single();
    expect(t!.status).toBe('overdue');
    // push terkirim, langganan yang hilang (410) dihapus
    expect(pushed).toContain('Tugas lewat tenggat');
    const { data: subs } = await db.from('push_subscriptions').select('device_label');
    expect(subs!.map((s) => s.device_label)).toEqual(['Laptop']);
  });

  it('peristiwa transaksi: peringatan budget 80% dan kemungkinan dobel', async () => {
    const tx = { kind: 'expense', amount: 42_000, account_id: acc.GoPay, category_id: makanId, merchant: 'Warung Uji', occurred_at: new Date().toISOString() };
    await db.from('transactions').insert(tx);
    await db.from('transactions').insert(tx);
    const r = await runTick(db, { push });
    expect(r.events).toBe(2);
    const n = await notes();
    expect(n.some((x) => x.dedupe_key?.endsWith(':80'))).toBe(true);
    expect(n.filter((x) => x.title === 'Mungkin tercatat dua kali').length).toBeGreaterThanOrEqual(1);
  });

  it('tugas baru: saran slot pengerjaan jadi usulan di agent_actions, bukan langsung tersimpan', async () => {
    const dueAt = new Date(Date.now() + 5 * 86400_000).toISOString();
    const { data: t } = await db.from('tasks').insert({ title: 'Uji: makalah', due_at: dueAt, estimated_minutes: 90 }).select('id').single();
    await runTick(db, { push });
    const { data: acts } = await db.from('agent_actions').select('tool_name,status,args,conversation_id').eq('tool_name', 'schedule_task_work');
    expect(acts).toHaveLength(1);
    expect(acts![0]).toMatchObject({ status: 'proposed', conversation_id: null });
    expect((acts![0].args as { task_id: string }).task_id).toBe(t!.id);
    expect((await db.from('task_work_slots').select('id').eq('task_id', t!.id)).data).toHaveLength(0);
  });

  it('impor massal tidak memicu otomasi peristiwa', async () => {
    await db.from('transactions').insert(Array.from({ length: 25 }, (_, i) => ({ kind: 'expense', amount: 1000 + i, account_id: acc.BCA, category_id: makanId, occurred_at: new Date().toISOString() })));
    const before = (await notes()).length;
    const r = await runTick(db, { push });
    expect(r.events).toBe(25);
    expect((await notes()).length).toBe(before);
    const { data: runs } = await db.from('automation_runs').select('output').eq('status', 'skipped');
    expect(JSON.stringify(runs)).toContain('impor massal');
  });

  it('jam tenang menunda notifikasi, tenggat di dalam jam tenang tetap langsung', async () => {
    // jam tenang mencakup sekarang
    const nowMin = (new Date().getUTCHours() * 60 + new Date().getUTCMinutes() + 420) % 1440;
    const hh = (m: number) => `${String(Math.floor(((m + 1440) % 1440) / 60)).padStart(2, '0')}:${String(((m + 1440) % 1440) % 60).padStart(2, '0')}`;
    await db.from('settings').upsert({ key: 'quiet_hours', value: [hh(nowMin - 30), hh(nowMin + 120)] }, { onConflict: 'user_id,key' });
    await db.from('research_targets').insert({ title: 'Uji: bab 2', progress: 10, last_touched_at: new Date(Date.now() - 6 * 86400_000).toISOString() });
    await db.from('tasks').insert({ title: 'Uji: kumpul sebentar lagi', due_at: new Date(Date.now() + 60 * 60_000).toISOString() });
    await db.from('automation_events').update({ processed_at: new Date().toISOString() }).is('processed_at', null);
    await due('research'); await due('deadlines');
    await runTick(db, { push });
    const n = await notes();
    const research = n.find((x) => x.title === 'Target riset menunggu')!;
    expect(research.deliver_after).not.toBeNull();
    expect(research.sent_at).toBeNull();
    const urgent = n.find((x) => x.body === 'Uji: kumpul sebentar lagi')!;
    expect(urgent.deliver_after).toBeNull();
    expect(urgent.sent_at).not.toBeNull();
    await db.from('settings').upsert({ key: 'quiet_hours', value: ['03:00', '03:01'] }, { onConflict: 'user_id,key' });
  });

  it('aturan buatan Ra: notifikasi terjadwal, auto_write mencatat langsung, tanpa auto_write jadi usulan', async () => {
    const ctx = { db, now: new Date(), today: todayIso() };
    const make = async (args: Record<string, unknown>) => {
      const p = await callTool(ctx, 'create_automation', args);
      if (p.kind !== 'proposal') throw new Error(JSON.stringify(p));
      const c = await commitTool(ctx, 'create_automation', p.resolved);
      if (!c.ok) throw new Error(c.error);
      return { id: String(c.data.id), summary: p.summary };
    };
    const wifi = await make({ name: 'Bayar wifi', trigger: { type: 'schedule', cron: '0 8 5 * *' }, mode: 'rule', auto_write: true, action: { type: 'add_transaction', args: { kind: 'expense', amount: 150000, account: 'GoPay', category: 'Pulsa' } } });
    expect(wifi.summary).toMatch(/Tiap tanggal 5 jam 08\.00 → Catat pengeluaran Rp150\.000 dari GoPay.*Otomatis tanpa konfirmasi: Ya/);
    const remind = await make({ name: 'Cek tabungan', trigger: { type: 'schedule', cron: '0 20 * * *' }, mode: 'rule', action: { type: 'notify', title: 'Cek tabungan' } });
    const kos = await make({ name: 'Bayar kos', trigger: { type: 'schedule', cron: '0 9 1 * *' }, mode: 'rule', action: { type: 'add_transaction', args: { kind: 'expense', amount: 900000, account: 'BCA' } } });
    // tick pertama menghitung jadwal berikutnya
    await runTick(db, { push });
    const { data: fresh } = await db.from('automations').select('id,next_run_at').in('id', [wifi.id, remind.id, kos.id]);
    expect(fresh!.every((a) => a.next_run_at)).toBe(true);
    const gopay = (await db.from('accounts').select('balance').eq('id', acc.GoPay).single()).data!.balance;
    await db.from('automations').update({ next_run_at: new Date(Date.now() - 60_000).toISOString() }).in('id', [wifi.id, remind.id, kos.id]);
    const r = await runTick(db, { push });
    expect(r.ran.map((x) => x.name)).toEqual(expect.arrayContaining(['Bayar wifi', 'Cek tabungan', 'Bayar kos']));
    expect((await db.from('accounts').select('balance').eq('id', acc.GoPay).single()).data!.balance).toBe(gopay - 150_000);
    const { data: tx } = await db.from('transactions').select('source').eq('amount', 150000).single();
    expect(tx!.source).toBe('automation');
    const { data: kosAct } = await db.from('agent_actions').select('status').eq('tool_name', 'add_transaction').eq('status', 'proposed');
    expect(kosAct!.length).toBeGreaterThanOrEqual(1);
    expect((await db.from('transactions').select('id').eq('amount', 900000)).data).toHaveLength(0);
    expect((await notes()).some((x) => x.title === 'Cek tabungan')).toBe(true);
  });
});
