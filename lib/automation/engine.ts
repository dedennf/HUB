// Mesin otomasi (SPEC 8.3): dipanggil /api/cron/tick tiap 5 menit dengan klien yang login sebagai pemilik (RLS tetap berlaku).
import type { SupabaseClient } from '@supabase/supabase-js';
import { proposeAction } from '@/lib/agent/actions';
import { runAgent } from '@/lib/agent/core';
import { callTool, commitTool } from '@/lib/agent/executor';
import type { AgentModel } from '@/lib/agent/model';
import { resolveAccount, resolveCategory } from '@/lib/agent/resolve';
import { createNotification, deliverPending, type NotificationInput, type PushSender } from '@/lib/notify';
import { addDays, isoWeekday, todayIso, zonedToIso } from '@/lib/time';
import { SYSTEM_AUTOMATIONS, systemByKey, type RunOutput, type TickEnv, type Trigger } from './system';
import { nextCronRun, readQuiet } from './time';

type AutomationRow = {
  id: string; name: string; is_enabled: boolean; is_system: boolean; system_key: string | null; trigger: Trigger;
  conditions: Condition[]; action: Record<string, unknown>; mode: 'rule' | 'agent'; auto_write: boolean; last_run_at: string | null; next_run_at: string | null;
};
type Condition = { metric: string; category?: string; account?: string; op: string; value: number };

export type TickReport = {
  at: string; seeded: number; ran: { name: string; status: string; summary: string }[]; events: number;
  delivered: { sent: number; devices: number; removed: number; errors: string[] };
};

const EVERY_TICK = '*/5 * * * *';
/** Lebih dari ini peristiwa sejenis dalam satu tick dianggap impor massal dan tidak memicu otomasi. */
export const BULK_EVENTS = 20;

/** JSON dengan kunci terurut. jsonb Postgres tidak menyimpan urutan kunci, jadi pembandingan teks biasa selalu berbeda. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

function nextRun(trigger: Trigger, from: Date): string | null {
  if (trigger.type === 'schedule') return nextCronRun(trigger.cron, from)?.toISOString() ?? null;
  if (trigger.type === 'threshold') return nextCronRun(EVERY_TICK, from)?.toISOString() ?? null;
  return null;
}

/** Pasang otomasi bawaan yang belum ada, dan sesuaikan jadwalnya bila jam di Pengaturan berubah. */
export async function ensureSystemAutomations(db: SupabaseClient, settings: Record<string, unknown>, now: Date): Promise<number> {
  const { data } = await db.from('automations').select('id,system_key,trigger').not('system_key', 'is', null);
  const have = new Map((data ?? []).map((r) => [r.system_key as string, r]));
  let seeded = 0;
  for (const d of SYSTEM_AUTOMATIONS) {
    const trigger = d.trigger(settings);
    const row = have.get(d.key);
    if (!row) {
      const { error } = await db.from('automations').insert({
        name: d.name, is_system: true, system_key: d.key, trigger, conditions: [], action: { type: 'system', key: d.key, description: d.description },
        mode: d.mode, auto_write: !!d.auto_write, is_enabled: true, next_run_at: nextRun(trigger, now),
      });
      if (!error) seeded++;
    } else if (canonical(row.trigger) !== canonical(trigger)) {
      await db.from('automations').update({ trigger, next_run_at: nextRun(trigger, now) }).eq('id', row.id);
    }
  }
  return seeded;
}

/* ---------------- aturan buatan pengguna (SPEC 8.2, 8.4) ---------------- */

const compare = (a: number, op: string, b: number) => (op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : op === '>=' ? a >= b : a === b);

async function metricValue(env: TickEnv, c: { metric: string; category?: string; account?: string }): Promise<number | null> {
  if (c.metric === 'account_balance') {
    if (!c.account) return null;
    const r = await resolveAccount(env.db, c.account);
    if (r.kind !== 'found') return null;
    const { data } = await env.db.from('accounts').select('balance').eq('id', r.id).maybeSingle();
    return data?.balance ?? null;
  }
  if (c.metric === 'category_spend_week' || c.metric === 'category_spend_month') {
    const from = c.metric === 'category_spend_week' ? addDays(env.today, 1 - isoWeekday(env.today)) : `${env.today.slice(0, 7)}-01`;
    let q = env.db.from('transactions').select('amount').eq('kind', 'expense').gte('occurred_at', zonedToIso(from));
    if (c.category) {
      const r = await resolveCategory(env.db, c.category, 'expense');
      if (r.kind !== 'found') return null;
      q = q.eq('category_id', r.id);
    }
    const { data } = await q;
    return (data ?? []).reduce((n, t) => n + t.amount, 0);
  }
  return null;
}

async function conditionsMet(env: TickEnv, list: Condition[]): Promise<boolean> {
  for (const c of list) {
    const v = await metricValue(env, c);
    if (v === null || !compare(v, c.op, c.value)) return false;
  }
  return true;
}

async function runCustom(env: TickEnv, a: AutomationRow, stamp: string, model: AgentModel | null): Promise<RunOutput | null> {
  if (a.trigger.type === 'threshold') {
    // ambang dicek tiap tick, tapi paling banyak jalan sekali per hari selama kondisinya bertahan
    if (a.last_run_at && todayIso(new Date(a.last_run_at)) === env.today) return null;
    const t = a.trigger as unknown as Condition;
    if (!(await conditionsMet(env, [{ metric: String(t.metric), account: t.account, op: t.op, value: Number(t.value) }]))) return null;
  }
  if (!(await conditionsMet(env, a.conditions ?? []))) return { summary: 'Kondisi belum terpenuhi', notified: 0, skipped: true };
  const action = a.action;
  if (action.type === 'notify') {
    const n = await env.notify({ title: String(action.title ?? a.name), body: action.body ? String(action.body) : undefined, url: '/otomasi', category: 'automation', dedupe_key: `auto:${a.id}:${stamp}` });
    return { summary: `Notifikasi "${action.title}"`, notified: Number(n) };
  }
  if (action.type === 'add_transaction') {
    const x = (action.args ?? {}) as Record<string, unknown>;
    const args = {
      kind: x.kind ?? 'expense', amount: x.amount, account: x.account_id ?? x.account, category: x.category_id ?? x.category,
      merchant: x.merchant, note: x.note ?? a.name,
    };
    const p = await callTool({ db: env.db, now: env.now, today: env.today }, 'add_transaction', args);
    if (p.kind !== 'proposal') return { summary: `Gagal menyiapkan transaksi: ${p.kind === 'error' ? p.error : 'tidak valid'}`, notified: 0, skipped: true };
    if (a.mode === 'rule' && a.auto_write) {
      // hanya aturan yang auto_write-nya disetujui pengguna saat dibuat yang boleh menulis langsung (SPEC 8.1)
      const c = await commitTool({ db: env.db, now: env.now, today: env.today }, 'add_transaction', p.resolved);
      if (!c.ok) return { summary: `Gagal mencatat: ${c.error}`, notified: 0, skipped: true };
      await env.db.from('transactions').update({ source: 'automation' }).eq('id', String(c.data?.id));
      const n = await env.notify({ title: `Otomasi: ${a.name}`, body: `Tercatat: ${p.summary}`, url: '/keuangan?tab=transaksi', category: 'automation', dedupe_key: `auto:${a.id}:${stamp}` });
      return { summary: `Tercatat: ${p.summary}`, notified: Number(n), written: 1 };
    }
    await proposeAction(env.db, null, p, args);
    const n = await env.notify({ title: `Usulan otomasi: ${a.name}`, body: `${p.summary}. Setujui di Beranda.`, url: '/', category: 'automation', dedupe_key: `auto:${a.id}:${stamp}` });
    return { summary: `Diusulkan: ${p.summary}`, notified: Number(n), proposed: 1 };
  }
  if (action.type === 'agent_task') {
    if (!model) return { summary: 'Gemini tidak tersedia, tugas Ra dilewati', notified: 0, skipped: true };
    // mode agent hanya menyarankan: tool tulis jadi usulan yang dikonfirmasi pengguna
    const r = await runAgent({ ctx: { db: env.db, now: env.now, today: env.today }, model, text: String(action.instruction ?? a.name), conversationId: null, maxSteps: 4, signal: AbortSignal.timeout(30_000) });
    const n = await env.notify({ title: a.name, body: r.reply + (r.action_ids.length ? ` (${r.action_ids.length} usulan menunggu di Beranda)` : ''), url: '/', category: 'automation', dedupe_key: `auto:${a.id}:${stamp}` });
    return { summary: r.reply.slice(0, 200), notified: Number(n), proposed: r.action_ids.length };
  }
  return { summary: `Aksi ${String(action.type)} tidak dikenal`, notified: 0, skipped: true };
}

async function runOne(env: TickEnv, a: AutomationRow, stamp: string, model: AgentModel | null, payload?: { id?: string }): Promise<{ status: 'success' | 'skipped' | 'failed'; out: RunOutput | null; error?: string }> {
  try {
    const def = a.system_key ? systemByKey.get(a.system_key) : undefined;
    const out = def ? await def.run(env, payload) : await runCustom(env, a, stamp, model);
    return { status: !out || out.skipped ? 'skipped' : 'success', out };
  } catch (e) {
    return { status: 'failed', out: null, error: (e as Error).message.slice(0, 300) };
  }
}

/** Catat jalannya otomasi. Lewatan rutin (tanpa hasil) tidak dicatat supaya riwayat tidak penuh tiap 5 menit. */
async function record(db: SupabaseClient, a: AutomationRow, r: Awaited<ReturnType<typeof runOne>>, now: Date, quietSkip: boolean) {
  const meaningful = r.status === 'failed' || (r.out && (r.out.notified || r.out.proposed || r.out.written || !quietSkip));
  if (meaningful) await db.from('automation_runs').insert({ automation_id: a.id, status: r.status, output: r.out ?? null, error: r.error ?? null });
  if (r.out || r.status === 'failed') await db.from('automations').update({ last_run_at: now.toISOString() }).eq('id', a.id);
}

export async function runTick(db: SupabaseClient, opts: { now?: Date; model?: AgentModel | null; push?: PushSender | null } = {}): Promise<TickReport> {
  const now = opts.now ?? new Date();
  const today = todayIso(now);
  const { data: srows } = await db.from('settings').select('key,value').in('key', ['briefing_time', 'recap_time', 'quiet_hours', 'vocab_review_time']);
  const settings = Object.fromEntries((srows ?? []).map((r) => [r.key, r.value]));
  const quiet = readQuiet(settings.quiet_hours);
  const env: TickEnv = { db, now, today, quiet, settings, notify: (n: NotificationInput) => createNotification(db, n, now, quiet) };
  const report: TickReport = { at: now.toISOString(), seeded: 0, ran: [], events: 0, delivered: { sent: 0, devices: 0, removed: 0, errors: [] } };

  report.seeded = await ensureSystemAutomations(db, settings, now);

  // aturan baru dari Ra (create_automation) dan otomasi yang baru diaktifkan ulang belum punya jadwal berikutnya
  const { data: fresh } = await db.from('automations').select('id,trigger').eq('is_enabled', true).is('next_run_at', null);
  for (const r of fresh ?? []) {
    const nr = nextRun(r.trigger as Trigger, now);
    if (nr) await db.from('automations').update({ next_run_at: nr }).eq('id', r.id);
  }

  // 1. jadwal dan ambang yang jatuh tempo
  const { data: due, error: claimErr } = await db.rpc('claim_due_automations', { lease_seconds: 600 });
  if (claimErr) throw new Error(`Klaim otomasi gagal: ${claimErr.message}`);
  for (const a of (due ?? []) as AutomationRow[]) {
    const r = await runOne(env, a, now.toISOString().slice(0, 16), opts.model ?? null);
    await record(db, a, r, now, a.trigger.type === 'schedule' && (a.trigger as { cron: string }).cron === EVERY_TICK || a.trigger.type === 'threshold');
    await db.from('automations').update({ next_run_at: nextRun(a.trigger, now) }).eq('id', a.id);
    if (r.out || r.status === 'failed') report.ran.push({ name: a.name, status: r.status, summary: r.out?.summary ?? r.error ?? '' });
  }

  // 2. peristiwa data
  const { data: events, error: evErr } = await db.rpc('claim_automation_events', { max_rows: 200 });
  if (evErr) throw new Error(`Klaim peristiwa gagal: ${evErr.message}`);
  const evs = (events ?? []) as { id: string; event: string; payload: { id?: string } }[];
  report.events = evs.length;
  if (evs.length) {
    const { data: listeners } = await db.from('automations').select('*').eq('is_enabled', true).eq('trigger->>type', 'event');
    const count = new Map<string, number>();
    for (const e of evs) count.set(e.event, (count.get(e.event) ?? 0) + 1);
    for (const a of (listeners ?? []) as AutomationRow[]) {
      const ev = (a.trigger as { event: string }).event;
      const mine = evs.filter((e) => e.event === ev);
      if (!mine.length) continue;
      if ((count.get(ev) ?? 0) > BULK_EVENTS) {
        await db.from('automation_runs').insert({ automation_id: a.id, status: 'skipped', output: { summary: `${mine.length} peristiwa ${ev} sekaligus (impor massal), dilewati` } });
        continue;
      }
      for (const e of mine) {
        const r = await runOne(env, a, e.id, opts.model ?? null, e.payload);
        await record(db, a, r, now, true);
        if (r.out && !r.out.skipped || r.status === 'failed') report.ran.push({ name: a.name, status: r.status, summary: r.out?.summary ?? r.error ?? '' });
      }
    }
  }

  // 3. kirim notifikasi yang jatuh tempo (termasuk yang tertunda jam tenang)
  report.delivered = await deliverPending(db, now, opts.push ?? null);
  return report;
}
