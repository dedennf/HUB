// Jalur cadangan saat Gemini tidak tersedia (SPEC 6.7, D-32): pengurai lokal → panggilan tool registry →
// usulan di agent_actions. Jadi alur konfirmasi, undo, dan Log Agen sama persis dengan jalur Gemini.
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDayShort, formatRp } from '@/lib/format';
import { parseCommand, type ParseContext, type Proposal, type Question } from '@/lib/parse/command';
import { addDays, zonedParts, zonedToIso } from '@/lib/time';
import { proposeAction, type Followup } from './actions';
import { callTool } from './executor';
import type { ToolCtx } from './tools/types';

type Db = SupabaseClient;

export async function loadParseContext(db: Db): Promise<ParseContext> {
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

export async function answer(db: Db, q: Question, ctx: ParseContext, today: string): Promise<string[]> {
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


/** Ubah usulan pengurai lokal menjadi panggilan tool registry (Fase 2). */
export function toToolCalls(p: Proposal, today: string): { tool: string; args: Record<string, unknown>; followups: Followup[] }[] {
  switch (p.type) {
    case 'transaction':
      return p.kind === 'transfer'
        ? [{ tool: 'add_transfer', followups: [], args: { amount: p.amount, from_account: p.account_id ?? undefined, to_account: p.to_account_id ?? undefined, fee: p.fee || undefined, occurred_at: p.date === today ? undefined : p.date } }]
        : [{ tool: 'add_transaction', followups: [], args: { kind: p.kind, amount: p.amount, account: p.account_id ?? undefined, category: p.category_id ?? undefined, note: p.note || undefined, occurred_at: p.date === today ? undefined : p.date } }];
    case 'task': {
      const followups: Followup[] = [];
      if (p.work_date) {
        const startT = p.work_start ?? '19:00';
        const end = new Date(new Date(zonedToIso(p.work_date, startT)).getTime() + 2 * 3600_000).toISOString();
        followups.push({ tool: 'schedule_task_work', ref_field: 'task', args: { start_at: `${p.work_date}T${startT}`, end_at: end } });
      }
      return [{ tool: 'add_task', followups, args: { title: p.title, kind: p.kind, course: p.course_id ?? undefined, due_at: p.due_date ? `${p.due_date}T${p.due_time}` : undefined } }];
    }
    case 'event':
      return [{ tool: 'add_event', followups: [], args: {
        title: p.title, start_at: p.start_time ? `${p.date}T${p.start_time}` : p.date,
        end_at: p.end_date || p.end_time ? `${p.end_date ?? p.date}T${p.end_time ?? '23:59'}` : undefined,
        location: p.location ?? undefined, recurrence: p.recurrence, recurrence_until: p.recurrence_until ?? undefined,
      } }];
    case 'idea':
      return [{ tool: 'add_research_idea', followups: [], args: { content: p.content } }];
    case 'need':
      return [{ tool: 'add_research_need', followups: [], args: { item: p.item } }];
  }
}

export type FallbackResult = { reply: string; lines?: string[]; action_ids: string[] };

export async function runFallback(ctx: ToolCtx, text: string, conversationId: string | null): Promise<FallbackResult> {
  const pc = await loadParseContext(ctx.db);
  const r = parseCommand(text, pc, ctx.today);
  if (r.kind === 'unknown') return { reply: HELP, action_ids: [] };
  if (r.kind === 'question') return { reply: 'Ini yang kutemukan:', lines: await answer(ctx.db, r.question, pc, ctx.today), action_ids: [] };
  const ids: string[] = [];
  const problems: string[] = [];
  for (const p of r.items) {
    for (const call of toToolCalls(p, ctx.today)) {
      const res = await callTool(ctx, call.tool, call.args);
      if (res.kind === 'proposal') ids.push(await proposeAction(ctx.db, conversationId, res, call.args, call.followups));
      else if (res.kind === 'error') problems.push(res.error.startsWith('Argumen tidak valid') ? 'Ada bagian yang belum jelas, misalnya nama akun. Tulis ulang lebih lengkap.' : res.error);
    }
  }
  const head = ids.length > 1 ? `Oke, ada ${ids.length} hal. Cek dulu sebelum disimpan.` : ids.length ? 'Cek dulu sebelum disimpan.' : 'Belum bisa kusiapkan.';
  return { reply: problems.length ? `${head} ${problems.join(' ')}` : head, action_ids: ids };
}
