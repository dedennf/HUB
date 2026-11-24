'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { formatDayShort, formatRp, formatTime } from '@/lib/format';
import { parseCommand, type ParseContext, type Proposal, type Question } from '@/lib/parse/command';
import { callTool, commitTool, mergeUndo, undo } from '@/lib/agent/executor';
import { toolCtx } from '@/lib/agent/context';
import type { UndoPayload } from '@/lib/agent/tools/types';
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

export type ApproveResult = { ok: boolean; message: string; undo: UndoPayload };

/** Ubah usulan pengurai lokal menjadi panggilan tool registry (Fase 2). */
function toToolCalls(p: z.infer<typeof proposalSchema>, today: string): { tool: string; args: Record<string, unknown> }[] {
  switch (p.type) {
    case 'transaction':
      return p.kind === 'transfer'
        ? [{ tool: 'add_transfer', args: { amount: p.amount, from_account: p.account_id, to_account: p.to_account_id, fee: p.fee || undefined, occurred_at: p.date === today ? undefined : p.date } }]
        : [{ tool: 'add_transaction', args: { kind: p.kind, amount: p.amount, account: p.account_id, category: p.category_id ?? undefined, note: p.note || undefined, occurred_at: p.date === today ? undefined : p.date } }];
    case 'task':
      return [{ tool: 'add_task', args: { title: p.title, kind: p.kind, course: p.course_id ?? undefined, due_at: p.due_date ? `${p.due_date}T${p.due_time}` : undefined } }];
    case 'event':
      return [{ tool: 'add_event', args: {
        title: p.title, start_at: p.start_time ? `${p.date}T${p.start_time}` : p.date,
        end_at: p.end_date || p.end_time ? `${p.end_date ?? p.date}T${p.end_time ?? '23:59'}` : undefined,
        location: p.location ?? undefined, recurrence: p.recurrence, recurrence_until: p.recurrence_until ?? undefined,
      } }];
    case 'idea':
      return [{ tool: 'add_research_idea', args: { content: p.content } }];
    case 'need':
      return [{ tool: 'add_research_need', args: { item: p.item } }];
  }
}

export async function approveRa(proposals: unknown[]): Promise<ApproveResult> {
  await requireUser();
  const parsed = z.array(proposalSchema).min(1).max(10).safeParse(proposals);
  if (!parsed.success) return { ok: false, message: 'Ada usulan yang belum lengkap (mis. akun belum jelas). Batalkan lalu tulis ulang.', undo: { ops: [] } };
  const ctx = await toolCtx();
  const undos: UndoPayload[] = [];
  const done: string[] = [];
  const rollback = async (msg: string): Promise<ApproveResult> => {
    await undo(ctx, mergeUndo(undos));
    return { ok: false, message: msg, undo: { ops: [] } };
  };
  for (const p of parsed.data) {
    for (const call of toToolCalls(p, ctx.today)) {
      const prepared = await callTool(ctx, call.tool, call.args);
      if (prepared.kind !== 'proposal') return rollback(prepared.kind === 'error' ? prepared.error : 'Usulan tidak valid.');
      const res = await commitTool(ctx, call.tool, prepared.resolved);
      if (!res.ok) return rollback(res.error);
      undos.push(res.undo);
      if (p.type === 'task' && p.work_date) {
        const start = `${p.work_date}T${p.work_start ?? '19:00'}`;
        const endIso = new Date(new Date(zonedToIso(p.work_date, p.work_start ?? '19:00')).getTime() + 2 * 3600_000).toISOString();
        const slot = await callTool(ctx, 'schedule_task_work', { task: String(res.data.id), start_at: start, end_at: endIso });
        if (slot.kind === 'proposal') {
          const c = await commitTool(ctx, 'schedule_task_work', { ...(slot.resolved as object), suggested_by_agent: false });
          if (c.ok) undos.push(c.undo);
        }
      }
      done.push(prepared.summary.split(' · ')[0]);
    }
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: `Tersimpan: ${done.join(', ')}`, undo: mergeUndo(undos) };
}

/** Tombol Batalkan di toast. Dari klien hanya operasi hapus baris yang baru dibuat yang diterima. */
export async function undoRa(payload: UndoPayload): Promise<{ ok: boolean }> {
  await requireUser();
  const ops = z.array(z.object({ op: z.literal('delete'), table: z.string(), id: z.uuid() })).max(30).safeParse(payload?.ops);
  if (!ops.success) return { ok: false };
  const r = await undo(await toolCtx(), { ops: ops.data });
  revalidatePath('/', 'layout');
  return { ok: r.ok };
}
