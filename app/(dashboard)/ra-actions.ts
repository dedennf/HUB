'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { formatDayShort, formatRp, formatTime } from '@/lib/format';
import { parseCommand, type ParseContext, type Proposal, type Question } from '@/lib/parse/command';
import { createClient } from '@/lib/supabase/server';
import { addDays, isHhmm, isIsoDate, todayIso, zonedParts, zonedToIso } from '@/lib/time';

/*
 * Ra sebelum tersambung ke Gemini (D-32): perintah dibaca pengurai lokal, hasilnya kartu usulan.
 * Tidak ada data yang berubah sampai pengguna menekan Setujui (SPEC 6.3).
 */

export type ProposalChip = { label: string; doubtful?: boolean };
export type ProposalView = {
  key: string;
  icon: 'expense' | 'income' | 'transfer' | 'task' | 'event' | 'idea' | 'need';
  kindLabel: string;
  value: string;
  chips: ProposalChip[];
  note?: string;
  proposal: Proposal;
};
export type RaReply = { reply: string; lines?: string[]; proposals: ProposalView[] };
export type Created = { table: string; id: string };

type Db = Awaited<ReturnType<typeof createClient>>;

async function loadContext(db: Db): Promise<ParseContext> {
  const [acc, cat, courses, sem, last] = await Promise.all([
    db.from('accounts').select('id,name,aliases,type').eq('is_archived', false).order('sort_order'),
    db.from('categories').select('id,kind,name,keywords,slug,is_hidden'),
    db.from('courses').select('id,name,alias,semester_id'),
    db.from('semesters').select('id').eq('is_active', true).maybeSingle(),
    db.from('transactions').select('account_id').eq('source', 'manual').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const activeSem = sem.data?.id;
  const sortedCourses = [...(courses.data ?? [])].sort((a, b) => Number(b.semester_id === activeSem) - Number(a.semester_id === activeSem));
  return {
    accounts: (acc.data ?? []) as ParseContext['accounts'],
    categories: (cat.data ?? []) as ParseContext['categories'],
    courses: sortedCourses.map(({ id, name, alias }) => ({ id, name, alias })),
    lastAccountId: last.data?.account_id ?? null,
  };
}

function view(p: Proposal, ctx: ParseContext, today: string, i: number): ProposalView {
  const acc = (id: string | null) => ctx.accounts.find((a) => a.id === id)?.name ?? 'Pilih akun';
  const cat = (id: string | null) => ctx.categories.find((c) => c.id === id)?.name ?? 'Tanpa kategori';
  const day = (d: string | null) => (!d ? 'Tanpa tanggal' : d === today ? 'Hari ini' : d === addDays(today, 1) ? 'Besok' : formatDayShort(d));
  const key = `${Date.now()}-${i}`;
  switch (p.type) {
    case 'transaction': {
      if (p.kind === 'transfer') {
        return {
          key, icon: 'transfer', kindLabel: 'Transfer', value: formatRp(p.amount), proposal: p,
          chips: [{ label: acc(p.account_id), doubtful: p.guessedAccount || !p.account_id }, { label: `ke ${acc(p.to_account_id)}`, doubtful: !p.to_account_id }, { label: day(p.date) }],
          note: p.fee ? `Biaya admin ${formatRp(p.fee)} dicatat terpisah.` : !p.account_id || !p.to_account_id ? 'Akun asal atau tujuan belum jelas. Batalkan lalu tulis ulang dengan nama akun.' : undefined,
        };
      }
      const notes = [p.guessedAccount ? 'Akun tidak disebut, dipakai akun terakhir.' : '', p.guessedCategory ? 'Kategori tidak dikenali, masuk Lainnya.' : ''].filter(Boolean);
      return {
        key, icon: p.kind, kindLabel: p.kind === 'income' ? 'Pemasukan' : 'Pengeluaran', value: formatRp(p.amount), proposal: p,
        chips: [{ label: cat(p.category_id), doubtful: p.guessedCategory }, { label: acc(p.account_id), doubtful: p.guessedAccount }, { label: day(p.date) }],
        note: [p.note ? `Catatan: ${p.note}.` : '', ...notes].filter(Boolean).join(' ') || undefined,
      };
    }
    case 'task':
      return {
        key, icon: 'task', kindLabel: { assignment: 'Tugas baru', exam: 'Ujian baru', quiz: 'Kuis baru', practicum: 'Praktikum baru' }[p.kind], value: p.title, proposal: p,
        chips: [
          { label: ctx.courses.find((c) => c.id === p.course_id)?.name ?? 'Tugas umum' },
          { label: p.due_date ? `${day(p.due_date)} · ${formatTime(p.due_time)}` : 'Tanpa tenggat', doubtful: p.guessedTime },
          ...(p.work_date ? [{ label: `Kerjakan ${day(p.work_date)}${p.work_start ? ` ${formatTime(p.work_start)}` : ''}` }] : []),
        ],
        note: p.guessedTime ? '"Jam 12 malem" dibaca 23.59.' : undefined,
      };
    case 'event':
      return {
        key, icon: 'event', kindLabel: 'Acara', value: p.title, proposal: p,
        chips: [
          { label: `${day(p.date)}${p.start_time ? ` · ${formatTime(p.start_time)}${p.end_time ? `–${formatTime(p.end_time)}` : ''}` : ''}` },
          ...(p.location ? [{ label: p.location }] : []),
          ...(p.recurrence !== 'none' ? [{ label: { daily: 'Tiap hari', weekly: 'Tiap minggu', monthly: 'Tiap bulan', yearly: 'Tiap tahun' }[p.recurrence] }] : []),
        ],
      };
    case 'idea':
      return { key, icon: 'idea', kindLabel: 'Ide riset', value: p.content, chips: [], proposal: p };
    case 'need':
      return { key, icon: 'need', kindLabel: 'Kebutuhan riset', value: p.item, chips: p.kind ? [{ label: p.kind }] : [], proposal: p };
  }
}

async function answer(db: Db, q: Question, ctx: ParseContext, today: string): Promise<string[]> {
  if (q.topic === 'balance') {
    const { data } = await db.from('accounts').select('id,name,balance,type').eq('is_archived', false).order('sort_order');
    const all = data ?? [];
    const list = q.accountIds.length ? all.filter((a) => q.accountIds.includes(a.id)) : all;
    if (!list.length) return ['Belum ada akun yang dicatat.'];
    const ready = all.filter((a) => a.type !== 'investment').reduce((n, a) => n + a.balance, 0);
    return [...(q.accountIds.length ? [] : [`Uang siap pakai: ${formatRp(ready)}`]), ...list.map((a) => `${a.name}: ${formatRp(a.balance)}`)];
  }
  if (q.topic === 'spending' || q.topic === 'income') {
    let query = db.from('transactions').select('amount').eq('kind', q.topic === 'income' ? 'income' : 'expense')
      .gte('occurred_at', zonedToIso(q.period.from)).lt('occurred_at', zonedToIso(addDays(q.period.to, 1)));
    if (q.categoryId) query = query.eq('category_id', q.categoryId);
    const { data } = await query;
    const total = (data ?? []).reduce((n, t) => n + t.amount, 0);
    const catName = q.categoryId ? ` ${ctx.categories.find((c) => c.id === q.categoryId)?.name}` : '';
    return [`${q.topic === 'income' ? 'Pemasukan' : 'Pengeluaran'}${catName} ${q.period.label}: ${formatRp(total)} (${(data ?? []).length} transaksi)`];
  }
  if (q.topic === 'tasks') {
    let query = db.from('tasks').select('title,due_at').neq('status', 'done').is('parent_id', null).order('due_at', { nullsFirst: false }).limit(8);
    if (q.period) query = query.gte('due_at', zonedToIso(q.period.from)).lt('due_at', zonedToIso(addDays(q.period.to, 1)));
    const { data } = await query;
    const label = q.period?.label ?? 'belum selesai';
    if (!data?.length) return [`Tidak ada tugas ${label}.`];
    return [`Tugas ${label}: ${data.length}`, ...data.map((t) => `${t.title}${t.due_at ? ` (${formatDayShort(zonedParts(t.due_at).date)})` : ''}`)];
  }
  const { data } = await db.from('bills').select('name,amount,next_due_date').eq('is_active', true).lte('next_due_date', addDays(today, 14)).order('next_due_date');
  if (!data?.length) return ['Tidak ada tagihan dalam 14 hari ke depan.'];
  return data.map((b) => `${b.name}: ${formatRp(b.amount)}, ${formatDayShort(b.next_due_date)}`);
}

const HELP = 'Belum bisa kubaca. Coba misalnya "kopi 18rb dana", "tugas laporan RDTR jumat 23.59", "rapat besok jam 14 di perpus", "ide: ...", atau "saldo berapa?". Bisa beberapa sekaligus dipisah koma atau "terus".';

export async function askRa(text: string): Promise<RaReply> {
  await requireUser();
  const clean = String(text ?? '').slice(0, 500);
  const db = await createClient();
  const today = todayIso();
  const ctx = await loadContext(db);
  const r = parseCommand(clean, ctx, today);
  if (r.kind === 'unknown') return { reply: HELP, proposals: [] };
  if (r.kind === 'question') return { reply: 'Ini yang kutemukan:', lines: await answer(db, r.question, ctx, today), proposals: [] };
  const views = r.items.map((p, i) => view(p, ctx, today, i));
  return { reply: views.length > 1 ? `Oke, ada ${views.length} hal. Cek dulu sebelum disimpan.` : 'Cek dulu sebelum disimpan.', proposals: views };
}

/* ---------------- eksekusi setelah disetujui ---------------- */

const date = z.string().refine(isIsoDate);
const time = z.string().refine(isHhmm);
const id = z.uuid();
const proposalSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('transaction'), kind: z.enum(['expense', 'income', 'transfer']), amount: z.number().int().positive(), date,
    account_id: id, to_account_id: id.nullable(), category_id: id.nullable(), note: z.string().max(500), fee: z.number().int().nonnegative(),
  }).loose(),
  z.object({
    type: z.literal('task'), title: z.string().min(1).max(160), kind: z.enum(['assignment', 'exam', 'quiz', 'practicum']), course_id: id.nullable(),
    due_date: date.nullable(), due_time: time, work_date: date.nullable(), work_start: time.nullable(),
  }).loose(),
  z.object({
    type: z.literal('event'), title: z.string().min(1).max(160), date, start_time: time.nullable(), end_time: time.nullable(), end_date: date.nullable(),
    location: z.string().max(120).nullable(), recurrence: z.enum(['none', 'daily', 'weekly', 'monthly', 'yearly']), recurrence_until: date.nullable(),
  }).loose(),
  z.object({ type: z.literal('idea'), content: z.string().min(1).max(1000) }),
  z.object({ type: z.literal('need'), item: z.string().min(1).max(200), kind: z.string().max(30).nullable() }),
]);

export type ApproveResult = { ok: boolean; message: string; created: Created[] };

export async function approveRa(proposals: unknown[]): Promise<ApproveResult> {
  await requireUser();
  const parsed = z.array(proposalSchema).min(1).max(10).safeParse(proposals);
  if (!parsed.success) return { ok: false, message: 'Ada usulan yang belum lengkap (mis. akun belum jelas). Batalkan lalu tulis ulang.', created: [] };
  const db = await createClient();
  const created: Created[] = [];
  const done: string[] = [];
  const fail = async (msg: string): Promise<ApproveResult> => { await undoCreated(db, created); return { ok: false, message: msg, created: [] }; };

  for (const p of parsed.data) {
    if (p.type === 'transaction') {
      if (p.kind === 'transfer' && (!p.to_account_id || p.to_account_id === p.account_id)) return fail('Akun tujuan transfer belum jelas.');
      const group = p.kind === 'transfer' && p.fee > 0 ? crypto.randomUUID() : null;
      const occurred = p.date === todayIso() ? new Date().toISOString() : zonedToIso(p.date, '12:00');
      const r = await db.from('transactions').insert({
        kind: p.kind, amount: p.amount, account_id: p.account_id, to_account_id: p.kind === 'transfer' ? p.to_account_id : null,
        category_id: p.kind === 'transfer' ? null : p.category_id, note: p.note || null, occurred_at: occurred, source: 'manual', group_id: group,
      }).select('id').single();
      if (r.error) return fail('Gagal menyimpan transaksi.');
      created.push({ table: 'transactions', id: r.data.id });
      if (group) {
        const { data: admin } = await db.from('categories').select('id').eq('slug', 'o_admin').maybeSingle();
        const f = await db.from('transactions').insert({
          kind: 'expense', amount: p.fee, account_id: p.account_id, category_id: admin?.id ?? null, note: 'Biaya admin', occurred_at: occurred, source: 'manual', group_id: group,
        }).select('id').single();
        if (f.error) return fail('Gagal menyimpan biaya admin.');
        created.push({ table: 'transactions', id: f.data.id });
      }
      done.push(`${{ expense: 'Pengeluaran', income: 'Pemasukan', transfer: 'Transfer' }[p.kind]} ${formatRp(p.amount)}`);
    } else if (p.type === 'task') {
      const r = await db.from('tasks').insert({
        title: p.title, kind: p.kind, course_id: p.course_id, due_at: p.due_date ? zonedToIso(p.due_date, p.due_time) : null,
      }).select('id').single();
      if (r.error) return fail('Gagal menyimpan tugas.');
      created.push({ table: 'tasks', id: r.data.id });
      if (p.work_date) {
        const start = zonedToIso(p.work_date, p.work_start ?? '19:00');
        await db.from('task_work_slots').insert({ task_id: r.data.id, start_at: start, end_at: new Date(new Date(start).getTime() + 2 * 3600_000).toISOString() });
      }
      done.push(p.title);
    } else if (p.type === 'event') {
      const r = await db.from('events').insert({
        title: p.title, start_at: zonedToIso(p.date, p.start_time ?? '00:00'), is_all_day: !p.start_time,
        end_at: p.end_date || p.end_time ? zonedToIso(p.end_date ?? p.date, p.end_time ?? '23:59') : null,
        location: p.location, recurrence: p.recurrence, recurrence_until: p.recurrence_until,
      }).select('id').single();
      if (r.error) return fail('Gagal menyimpan acara.');
      created.push({ table: 'events', id: r.data.id });
      done.push(p.title);
    } else {
      const { data: project } = await db.from('research_projects').select('id').eq('status', 'active').order('created_at').limit(1).maybeSingle();
      const r = p.type === 'idea'
        ? await db.from('research_ideas').insert({ content: p.content, project_id: project?.id ?? null }).select('id').single()
        : await db.from('research_needs').insert({ item: p.item, kind: p.kind, project_id: project?.id ?? null }).select('id').single();
      if (r.error) return fail('Gagal menyimpan catatan riset.');
      created.push({ table: p.type === 'idea' ? 'research_ideas' : 'research_needs', id: r.data.id });
      done.push(p.type === 'idea' ? 'ide riset' : 'kebutuhan riset');
    }
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: `Tersimpan: ${done.join(', ')}`, created };
}

const UNDO_TABLES = new Set(['transactions', 'tasks', 'events', 'research_ideas', 'research_needs']);

async function undoCreated(db: Db, created: Created[]) {
  for (const c of [...created].reverse()) {
    if (UNDO_TABLES.has(c.table) && /^[0-9a-f-]{36}$/i.test(c.id)) await db.from(c.table).delete().eq('id', c.id);
  }
}

/** Tombol Batalkan di toast: menghapus semua yang baru dibuat dari satu persetujuan. */
export async function undoRa(created: Created[]): Promise<{ ok: boolean }> {
  await requireUser();
  const list = z.array(z.object({ table: z.string(), id: z.uuid() })).max(20).safeParse(created);
  if (!list.success) return { ok: false };
  await undoCreated(await createClient(), list.data);
  revalidatePath('/', 'layout');
  return { ok: true };
}
