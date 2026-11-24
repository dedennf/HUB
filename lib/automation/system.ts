// Otomasi bawaan (SPEC 8.5). Semua bisa dinonaktifkan di halaman Otomasi.
// Mode "agent" di sini hanya menyarankan: notifikasi, atau usulan di agent_actions yang dikonfirmasi pengguna (SPEC 8.1).
// Isinya disusun kode dari data (D-50), bukan teks bebas Gemini, supaya pasti, cepat, dan tidak memakan kuota.
import type { SupabaseClient } from '@supabase/supabase-js';
import { proposeAction } from '@/lib/agent/actions';
import { callTool } from '@/lib/agent/executor';
import { formatRp } from '@/lib/format';
import type { NotificationInput } from '@/lib/notify';
import { addDays, isoWeekday, zonedParts, zonedToIso } from '@/lib/time';
import { dailyCron, type Quiet } from './time';

export type TickEnv = {
  db: SupabaseClient; now: Date; today: string; quiet: Quiet; settings: Record<string, unknown>;
  notify: (n: NotificationInput) => Promise<boolean>;
};
export type RunOutput = { summary: string; notified: number; proposed?: number; written?: number; skipped?: boolean };
export type Trigger = { type: 'schedule'; cron: string } | { type: 'event'; event: string } | { type: 'threshold'; [k: string]: unknown };

type SystemDef = {
  key: string; name: string; mode: 'rule' | 'agent'; description: string; auto_write?: boolean;
  trigger: (settings: Record<string, unknown>) => Trigger;
  run: (env: TickEnv, payload?: { id?: string }) => Promise<RunOutput>;
};

const EVERY_TICK = '*/5 * * * *';
const ctxOf = (env: TickEnv) => ({ db: env.db, now: env.now, today: env.today });
const hm = (iso: string) => zonedParts(iso).time.replace(':', '.');
const dayName = (d: string, today: string) => (d === today ? 'hari ini' : d === addDays(today, 1) ? 'besok' : new Date(`${d}T12:00:00Z`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }));
const ok = (summary: string, notified = 0, extra: Partial<RunOutput> = {}): RunOutput => ({ summary, notified, ...extra });

async function openTasks(db: SupabaseClient, untilIso: string) {
  const { data } = await db.from('tasks').select('id,title,due_at,kind,status').in('status', ['todo', 'in_progress']).is('parent_id', null)
    .not('due_at', 'is', null).lte('due_at', untilIso).order('due_at');
  return data ?? [];
}

async function classesOn(env: TickEnv, date: string): Promise<{ course?: string; start: string }[]> {
  const r = await callTool(ctxOf(env), 'get_course_schedule', { date });
  return r.kind === 'read' ? ((r.data as { classes?: { course?: string; start: string }[] }).classes ?? []) : [];
}

/* ---------------- penangan ---------------- */

async function briefing(env: TickEnv): Promise<RunOutput> {
  const { db, today, now } = env;
  const [classes, tasks, bills, accounts, vocab] = await Promise.all([
    classesOn(env, today),
    openTasks(db, zonedToIso(addDays(today, 3), '23:59')),
    db.from('bills').select('name,amount,next_due_date').eq('is_active', true).lte('next_due_date', addDays(today, 3)).order('next_due_date').then((r) => r.data ?? []),
    db.from('accounts').select('name,balance,type').eq('is_archived', false).neq('type', 'investment').then((r) => r.data ?? []),
    db.from('vocab').select('id', { count: 'exact', head: true }).lte('due_at', now.toISOString()).then((r) => r.count ?? 0),
  ]);
  // satu kosakata hari ini (SPEC 8.5): kata jatuh tempo yang paling lama, atau kata terbaru
  const { data: word } = await db.from('vocab').select('term,meaning_id').order('due_at').limit(1).maybeSingle();
  const lines = [
    classes.length ? `Kuliah: ${classes.map((c) => `${c.course ?? 'kelas'} ${c.start.replace(':', '.')}`).join(', ')}` : 'Tidak ada kuliah hari ini.',
    tasks.length ? `Tenggat dekat: ${tasks.slice(0, 3).map((t) => `${t.title} (${dayName(zonedParts(t.due_at!).date, today)} ${hm(t.due_at!)})`).join(', ')}` : '',
    bills.length ? `Tagihan: ${bills.map((b) => `${b.name} ${formatRp(b.amount)} ${dayName(b.next_due_date, today)}`).join(', ')}` : '',
    ...accounts.filter((a) => a.balance < 50_000).map((a) => `Saldo ${a.name} tinggal ${formatRp(a.balance)}.`),
    word ? `Kata hari ini: ${word.term}${word.meaning_id ? ` (${word.meaning_id})` : ''}${vocab > 1 ? `, plus ${vocab - 1} kata lain siap diulang` : ''}.` : '',
  ].filter(Boolean);
  const n = await env.notify({ title: 'Briefing pagi', body: lines.join('\n'), url: '/', category: 'briefing', dedupe_key: `briefing:${today}` });
  return ok(lines.join(' | '), Number(n));
}

async function recap(env: TickEnv): Promise<RunOutput> {
  const { db, today } = env;
  const from = zonedToIso(today), to = zonedToIso(addDays(today, 1));
  const [spent, done, tomorrowTasks, tomorrowClasses] = await Promise.all([
    db.from('transactions').select('amount').eq('kind', 'expense').gte('occurred_at', from).lt('occurred_at', to).then((r) => r.data ?? []),
    db.from('tasks').select('title').eq('status', 'done').gte('completed_at', from).lt('completed_at', to).then((r) => r.data ?? []),
    openTasks(env.db, zonedToIso(addDays(today, 1), '23:59')),
    classesOn(env, addDays(today, 1)),
  ]);
  const total = spent.reduce((n, t) => n + t.amount, 0);
  const lines = [
    `Pengeluaran hari ini ${formatRp(total)} (${spent.length} transaksi).`,
    done.length ? `Tugas selesai: ${done.map((t) => t.title).slice(0, 3).join(', ')}.` : 'Belum ada tugas yang selesai hari ini.',
    tomorrowClasses.length ? `Besok kuliah ${tomorrowClasses.map((c) => `${c.course ?? 'kelas'} ${c.start.replace(':', '.')}`).join(', ')}.` : '',
    tomorrowTasks.filter((t) => zonedParts(t.due_at!).date <= addDays(today, 1)).length ? `Siapkan: ${tomorrowTasks.filter((t) => zonedParts(t.due_at!).date <= addDays(today, 1)).map((t) => t.title).slice(0, 3).join(', ')}.` : '',
  ].filter(Boolean);
  const n = await env.notify({ title: 'Rekap malam', body: lines.join('\n'), url: '/', category: 'recap', dedupe_key: `recap:${today}` });
  return ok(lines.join(' | '), Number(n));
}

/** H-3, H-1, dan 3 jam sebelum tenggat (SPEC 8.5). Satu tahap dikirim sekali per tugas. */
export function deadlineStage(dueMs: number, nowMs: number): 'h3' | 'h1' | 'j3' | null {
  const left = dueMs - nowMs;
  if (left <= 0) return null;
  if (left <= 3 * 3600_000) return 'j3';
  if (left <= 24 * 3600_000) return 'h1';
  if (left <= 72 * 3600_000) return 'h3';
  return null;
}

async function deadlines(env: TickEnv): Promise<RunOutput> {
  const tasks = await openTasks(env.db, new Date(env.now.getTime() + 72 * 3600_000).toISOString());
  let n = 0;
  for (const t of tasks) {
    const due = new Date(t.due_at!);
    const stage = deadlineStage(due.getTime(), env.now.getTime());
    if (!stage) continue;
    const label = stage === 'j3' ? 'kurang dari 3 jam lagi' : stage === 'h1' ? `besok ${hm(t.due_at!)}` : `${dayName(zonedParts(t.due_at!).date, env.today)} ${hm(t.due_at!)}`;
    if (await env.notify({ title: `Tenggat ${label}`, body: t.title, url: '/kuliah', category: 'deadline', dedupe_key: `deadline:${t.id}:${stage}`, event_at: due })) n++;
  }
  return ok(`${tasks.length} tugas dicek, ${n} pengingat`, n);
}

async function overdue(env: TickEnv): Promise<RunOutput> {
  const { data } = await env.db.from('tasks').select('id,title').in('status', ['todo', 'in_progress']).lt('due_at', env.now.toISOString()).not('due_at', 'is', null);
  const list = data ?? [];
  if (!list.length) return ok('Tidak ada tugas lewat tenggat', 0);
  await env.db.from('tasks').update({ status: 'overdue' }).in('id', list.map((t) => t.id));
  let n = 0;
  for (const t of list) if (await env.notify({ title: 'Tugas lewat tenggat', body: t.title, url: '/kuliah', category: 'task', dedupe_key: `overdue:${t.id}` })) n++;
  return ok(`${list.length} tugas ditandai lewat tenggat`, n, { written: list.length });
}

async function workSlot(env: TickEnv, payload?: { id?: string }): Promise<RunOutput> {
  if (!payload?.id) return ok('Tanpa tugas', 0, { skipped: true });
  const { data: t } = await env.db.from('tasks').select('id,title,due_at,status,estimated_minutes').eq('id', payload.id).maybeSingle();
  if (!t?.due_at || t.status === 'done' || new Date(t.due_at).getTime() - env.now.getTime() < 24 * 3600_000) return ok('Tenggat terlalu dekat atau tanpa tenggat', 0, { skipped: true });
  const { count } = await env.db.from('task_work_slots').select('id', { count: 'exact', head: true }).eq('task_id', t.id);
  if (count) return ok('Sudah punya jadwal kerja', 0, { skipped: true });
  const minutes = Math.min(Math.max(t.estimated_minutes ?? 120, 60), 240);
  const last = zonedParts(new Date(new Date(t.due_at).getTime() - 3600_000)).date;
  const slots = await callTool(ctxOf(env), 'find_free_slots', { from: env.today, to: last < env.today ? env.today : last, min_minutes: minutes });
  const first = slots.kind === 'read' ? (slots.data as { date: string; start: string }[])[0] : undefined;
  if (!first) return ok('Tidak ada slot kosong sebelum tenggat', 0, { skipped: true });
  const end = new Date(new Date(zonedToIso(first.date, first.start)).getTime() + minutes * 60_000).toISOString();
  const p = await callTool(ctxOf(env), 'schedule_task_work', { task: t.id, start_at: `${first.date}T${first.start}`, end_at: end });
  if (p.kind !== 'proposal') return ok('Slot tidak bisa diusulkan', 0, { skipped: true });
  await proposeAction(env.db, null, p, { task: t.id, start_at: `${first.date}T${first.start}`, end_at: end });
  const n = await env.notify({ title: 'Saran waktu mengerjakan', body: `${t.title}: ${dayName(first.date, env.today)} ${first.start.replace(':', '.')}. Setujui di Beranda.`, url: '/', category: 'task', dedupe_key: `slot:${t.id}` });
  return ok(p.summary, Number(n), { proposed: 1 });
}

async function bills(env: TickEnv): Promise<RunOutput> {
  const { db, today } = env;
  const { data } = await db.from('bills').select('id,name,amount,next_due_date,default_account_id').eq('is_active', true).in('next_due_date', [addDays(today, 1), addDays(today, 3)]);
  let n = 0;
  for (const b of data ?? []) {
    const stage = b.next_due_date === addDays(today, 1) ? 'h1' : 'h3';
    let note = '';
    if (b.default_account_id) {
      const { data: acc } = await db.from('accounts').select('name,balance').eq('id', b.default_account_id).maybeSingle();
      if (acc && acc.balance < b.amount) note = ` Saldo ${acc.name} ${formatRp(acc.balance)}, kurang ${formatRp(b.amount - acc.balance)}.`;
    }
    if (await env.notify({ title: `Tagihan ${b.name} ${stage === 'h1' ? 'besok' : '3 hari lagi'}`, body: `${formatRp(b.amount)} jatuh tempo ${dayName(b.next_due_date, today)}.${note}`, url: '/keuangan?tab=rencana', category: 'bill', dedupe_key: `bill:${b.id}:${b.next_due_date}:${stage}` })) n++;
  }
  return ok(`${(data ?? []).length} tagihan dicek`, n);
}

async function expenseTx(env: TickEnv, id?: string) {
  if (!id) return null;
  const { data } = await env.db.from('transactions').select('id,kind,amount,account_id,category_id,occurred_at,created_at,merchant,note').eq('id', id).maybeSingle();
  // transaksi lama (impor, catat mundur lebih dari 2 hari) tidak memicu peringatan
  if (!data || data.kind !== 'expense' || !data.category_id || env.now.getTime() - new Date(data.occurred_at).getTime() > 2 * 86400_000) return null;
  return data;
}

async function budget(env: TickEnv, payload?: { id?: string }): Promise<RunOutput> {
  const tx = await expenseTx(env, payload?.id);
  if (!tx) return ok('Bukan pengeluaran baru berkategori', 0, { skipped: true });
  const { data: cat } = await env.db.from('categories').select('name,monthly_budget').eq('id', tx.category_id).maybeSingle();
  if (!cat?.monthly_budget) return ok('Kategori tanpa budget', 0, { skipped: true });
  const month = env.today.slice(0, 7);
  const { data: rows } = await env.db.from('transactions').select('amount').eq('kind', 'expense').eq('category_id', tx.category_id).gte('occurred_at', zonedToIso(`${month}-01`));
  const spent = (rows ?? []).reduce((n, r) => n + r.amount, 0);
  const pct = Math.floor((spent / cat.monthly_budget) * 100);
  const level = pct >= 100 ? 100 : pct >= 80 ? 80 : 0;
  if (!level) return ok(`${cat.name} ${pct}% dari budget`, 0);
  const n = await env.notify({
    title: level === 100 ? `Budget ${cat.name} terlampaui` : `Budget ${cat.name} sudah ${pct}%`,
    body: `${formatRp(spent)} dari ${formatRp(cat.monthly_budget)} bulan ini.`, url: '/keuangan?tab=rencana', category: 'budget', dedupe_key: `budget:${tx.category_id}:${month}:${level}`,
  });
  return ok(`${cat.name} ${pct}%`, Number(n));
}

/** Nominal jauh di atas kebiasaan: minimal 3x median dan ≥ Rp50.000, dari minimal 5 transaksi pembanding. */
export function isUnusual(amount: number, history: number[]): boolean {
  if (history.length < 5 || amount < 50_000) return false;
  const s = [...history].sort((a, b) => a - b);
  const median = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return amount >= median * 3;
}

async function anomaly(env: TickEnv, payload?: { id?: string }): Promise<RunOutput> {
  const tx = await expenseTx(env, payload?.id);
  if (!tx) return ok('Bukan pengeluaran baru berkategori', 0, { skipped: true });
  const t = new Date(tx.occurred_at).getTime();
  const [{ data: hist }, { data: twins }] = await Promise.all([
    env.db.from('transactions').select('amount').eq('kind', 'expense').eq('category_id', tx.category_id).neq('id', tx.id).gte('occurred_at', new Date(t - 90 * 86400_000).toISOString()),
    env.db.from('transactions').select('id').eq('kind', 'expense').eq('amount', tx.amount).eq('account_id', tx.account_id).neq('id', tx.id)
      .gte('occurred_at', new Date(t - 10 * 60_000).toISOString()).lte('occurred_at', new Date(t + 10 * 60_000).toISOString()),
  ]);
  const label = `${tx.merchant ?? tx.note ?? 'Transaksi'} ${formatRp(tx.amount)}`;
  if (twins?.length) {
    const n = await env.notify({ title: 'Mungkin tercatat dua kali', body: `${label} punya kembaran dengan nominal dan akun yang sama dalam 10 menit.`, url: `/keuangan/transaksi/${tx.id}`, category: 'anomaly', dedupe_key: `anomaly:${tx.id}` });
    return ok(`Kemungkinan dobel: ${label}`, Number(n));
  }
  if (isUnusual(tx.amount, (hist ?? []).map((h) => h.amount))) {
    const n = await env.notify({ title: 'Pengeluaran tidak biasa', body: `${label} jauh di atas kebiasaan kategori ini. Cek lagi kalau salah catat.`, url: `/keuangan/transaksi/${tx.id}`, category: 'anomaly', dedupe_key: `anomaly:${tx.id}` });
    return ok(`Tidak biasa: ${label}`, Number(n));
  }
  return ok('Wajar', 0);
}

async function research(env: TickEnv): Promise<RunOutput> {
  const cutoff = new Date(env.now.getTime() - 4 * 86400_000).toISOString();
  const { data } = await env.db.from('research_targets').select('title,last_touched_at,created_at,progress').lt('progress', 100);
  const stale = (data ?? []).filter((r) => (r.last_touched_at ?? r.created_at) < cutoff);
  if (!stale.length) return ok('Semua target riset tersentuh', 0);
  const n = await env.notify({ title: 'Target riset menunggu', body: `${stale.slice(0, 3).map((r) => `${r.title} (${r.progress}%)`).join(', ')} belum disentuh lebih dari 4 hari.`, url: '/riset', category: 'research', dedupe_key: `research:${env.today}` });
  return ok(`${stale.length} target lama tidak disentuh`, Number(n));
}

async function weekly(env: TickEnv): Promise<RunOutput> {
  const { db, today } = env;
  const from = zonedToIso(addDays(today, -6));
  const [tx, targets, reviews] = await Promise.all([
    db.from('transactions').select('kind,amount').gte('occurred_at', from).then((r) => r.data ?? []),
    db.from('research_targets').select('title,progress').lt('progress', 100).order('due_date', { nullsFirst: false }).limit(3).then((r) => r.data ?? []),
    db.from('vocab_reviews').select('id', { count: 'exact', head: true }).gte('created_at', from).then((r) => r.count ?? 0),
  ]);
  const inc = tx.filter((t) => t.kind === 'income').reduce((n, t) => n + t.amount, 0);
  const exp = tx.filter((t) => t.kind === 'expense').reduce((n, t) => n + t.amount, 0);
  const lines = [
    `Seminggu: masuk ${formatRp(inc)}, keluar ${formatRp(exp)}, bersih ${formatRp(inc - exp, { sign: true })}.`,
    targets.length ? `Riset: ${targets.map((t) => `${t.title} ${t.progress}%`).join(', ')}.` : '',
    `Bahasa: ${reviews} review kosakata minggu ini.`,
  ].filter(Boolean);
  const n = await env.notify({ title: 'Rekap mingguan', body: lines.join('\n'), url: '/', category: 'recap', dedupe_key: `weekly:${today}` });
  return ok(lines.join(' | '), Number(n));
}

async function vocabReview(env: TickEnv): Promise<RunOutput> {
  const { count } = await env.db.from('vocab').select('id', { count: 'exact', head: true }).lte('due_at', env.now.toISOString());
  if (!count) return ok('Tidak ada kosakata jatuh tempo', 0);
  const n = await env.notify({ title: `${count} kosakata siap diulang`, body: 'Lima menit cukup untuk menjaga ingatan.', url: '/bahasa', category: 'english', dedupe_key: `vocab:${env.today}` });
  return ok(`${count} kata`, Number(n));
}

async function busyWeek(env: TickEnv): Promise<RunOutput> {
  const monday = addDays(env.today, 1 - isoWeekday(env.today));
  const tasks = await openTasks(env.db, zonedToIso(addDays(monday, 6), '23:59'));
  const week = tasks.filter((t) => zonedParts(t.due_at!).date >= monday);
  const exams = week.filter((t) => t.kind === 'exam').length;
  if (week.length < 4 && exams < 2) return ok(`${week.length} tenggat minggu ini, tidak padat`, 0);
  const n = await env.notify({
    title: 'Minggu ini padat',
    body: `${week.length} tenggat${exams ? `, ${exams} ujian` : ''}. Pertimbangkan menunda target riset dan menurunkan target latihan bahasa minggu ini.`,
    url: '/kuliah', category: 'task', dedupe_key: `busy:${monday}`,
  });
  return ok(`${week.length} tenggat, ${exams} ujian`, Number(n));
}

export const SYSTEM_AUTOMATIONS: SystemDef[] = [
  { key: 'briefing', name: 'Briefing pagi', mode: 'agent', description: 'Kuliah hari ini, tenggat terdekat, tagihan, saldo kritis, kosakata', trigger: (s) => ({ type: 'schedule', cron: dailyCron(s.briefing_time, '06:30') }), run: briefing },
  { key: 'recap', name: 'Rekap malam', mode: 'agent', description: 'Pengeluaran hari ini, tugas selesai, persiapan besok', trigger: (s) => ({ type: 'schedule', cron: dailyCron(s.recap_time, '21:00') }), run: recap },
  { key: 'deadlines', name: 'Pengingat tenggat bertingkat', mode: 'rule', description: 'H-3, H-1, dan 3 jam sebelum tenggat tugas', trigger: () => ({ type: 'schedule', cron: EVERY_TICK }), run: deadlines },
  { key: 'overdue', name: 'Tugas lewat tenggat', mode: 'rule', auto_write: true, description: 'Status jadi lewat tenggat + notifikasi', trigger: () => ({ type: 'schedule', cron: EVERY_TICK }), run: overdue },
  { key: 'work_slot', name: 'Saran slot pengerjaan', mode: 'agent', description: 'Cari waktu kosong untuk tugas baru, usulan dikonfirmasi di Beranda', trigger: () => ({ type: 'event', event: 'task.created' }), run: workSlot },
  { key: 'bills', name: 'Pengingat tagihan', mode: 'rule', description: 'H-3 dan H-1, cek saldo akun bawaan', trigger: () => ({ type: 'schedule', cron: '0 8 * * *' }), run: bills },
  { key: 'budget', name: 'Peringatan budget', mode: 'rule', description: 'Kategori melewati 80% dan 100% budget bulanan', trigger: () => ({ type: 'event', event: 'transaction.created' }), run: budget },
  { key: 'anomaly', name: 'Deteksi transaksi janggal', mode: 'agent', description: 'Nominal jauh di atas kebiasaan atau kemungkinan dobel', trigger: () => ({ type: 'event', event: 'transaction.created' }), run: anomaly },
  { key: 'research', name: 'Pengingat riset', mode: 'rule', description: 'Target aktif tidak disentuh lebih dari 4 hari', trigger: () => ({ type: 'schedule', cron: '0 9 * * *' }), run: research },
  { key: 'weekly', name: 'Rekap mingguan', mode: 'agent', description: 'Arus uang, progres riset, progres bahasa', trigger: () => ({ type: 'schedule', cron: '0 19 * * 0' }), run: weekly },
  { key: 'vocab', name: 'Review kosakata', mode: 'rule', description: 'Jumlah kata yang jatuh tempo', trigger: (s) => ({ type: 'schedule', cron: dailyCron(s.vocab_review_time, '19:30') }), run: vocabReview },
  { key: 'busy_week', name: 'Penyeimbang minggu padat', mode: 'agent', description: 'Minggu padat tugas atau ujian: saran mengurangi beban lain', trigger: () => ({ type: 'schedule', cron: '0 6 * * 1' }), run: busyWeek },
];
export const systemByKey = new Map(SYSTEM_AUTOMATIONS.map((d) => [d.key, d]));
