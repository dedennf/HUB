import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { addDays, zonedToIso } from '@/lib/time';
import type * as T from '@/lib/types';

type Db = Awaited<ReturnType<typeof createClient>>;

async function rows<R>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<R[]> {
  const { data, error } = await q;
  if (error) throw new Error(`Gagal memuat data: ${error.message}`);
  return (data ?? []) as R[];
}

export async function db(): Promise<Db> {
  return createClient();
}

export const getAccounts = (s: Db) =>
  rows<T.Account>(s.from('accounts').select('id,name,type,opening_balance,balance,aliases,is_archived,sort_order').order('sort_order').order('name'));

export const getCategories = (s: Db) =>
  rows<T.Category>(s.from('categories').select('id,slug,name,kind,icon,color,monthly_budget,keywords,subcategories,sort_order,is_hidden').order('kind').order('sort_order'));

/** Transaksi dalam satu bulan kalender WIB (ym = 'YYYY-MM'). */
export function getTransactionsInMonth(s: Db, ym: string) {
  const start = zonedToIso(`${ym}-01`);
  const [y, m] = ym.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const end = zonedToIso(`${next}-01`);
  return rows<T.Transaction>(
    s.from('transactions')
      .select('id,kind,amount,account_id,to_account_id,category_id,subcategory,merchant,note,occurred_at,source,group_id')
      .gte('occurred_at', start).lt('occurred_at', end)
      .order('occurred_at', { ascending: false }).order('created_at', { ascending: false }),
  );
}

export async function getTransaction(s: Db, id: string): Promise<T.Transaction | null> {
  const { data, error } = await s.from('transactions')
    .select('id,kind,amount,account_id,to_account_id,category_id,subcategory,merchant,note,occurred_at,source,group_id')
    .eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as T.Transaction | null;
}

export const getBills = (s: Db) =>
  rows<T.Bill>(s.from('bills').select('id,name,amount,frequency,next_due_date,default_account_id,category_id,is_active,note').order('next_due_date'));
export const getDebts = (s: Db) =>
  rows<T.Debt>(s.from('debts').select('id,direction,person,amount,paid_amount,occurred_on,due_on,note').order('created_at'));
export const getSavingsGoals = (s: Db) =>
  rows<T.SavingsGoal>(s.from('savings_goals').select('id,name,target_amount,saved_amount,deadline').order('created_at'));
export const getSinkingFunds = (s: Db) =>
  rows<T.SinkingFund>(s.from('sinking_funds').select('id,name,amount,saved_amount,due_on,is_done').order('due_on'));
export const getInvestments = (s: Db) =>
  rows<T.Investment>(s.from('investments').select('id,name,instrument,platform,invested_amount,current_value').order('created_at'));

export const getSemesters = (s: Db) =>
  rows<T.Semester>(s.from('semesters').select('id,name,number,start_date,end_date,is_active').order('number'));
export const getCourses = (s: Db) =>
  rows<T.Course>(s.from('courses').select('id,semester_id,name,alias,lecturer,credits').order('name'));
export const getSchedules = (s: Db) =>
  rows<T.CourseSchedule>(s.from('course_schedules').select('id,course_id,weekday,start_time,end_time,location').order('weekday').order('start_time'));
export const getTasks = (s: Db) =>
  rows<T.Task>(s.from('tasks').select('id,course_id,parent_id,title,kind,priority,due_at,status,description').order('due_at', { nullsFirst: false }));
export const getWorkSlots = (s: Db) =>
  rows<T.TaskWorkSlot>(s.from('task_work_slots').select('id,task_id,start_at,end_at').order('start_at'));
export const getHolidays = (s: Db) =>
  rows<T.Holiday>(s.from('holidays').select('id,name,start_date,end_date').order('start_date'));
export const getEvents = (s: Db) =>
  rows<T.CalendarEvent>(s.from('events').select('id,title,start_at,end_at,is_all_day,location,recurrence,recurrence_until').order('start_at'));

export const getResearchProjects = (s: Db) => rows<T.ResearchProject>(s.from('research_projects').select('id,title,status').order('created_at'));
export const getResearchTargets = (s: Db) => rows<T.ResearchTarget>(s.from('research_targets').select('id,project_id,title,due_date,progress,last_touched_at').order('due_date'));
export const getResearchNeeds = (s: Db) => rows<T.ResearchNeed>(s.from('research_needs').select('id,project_id,item,kind,status').order('created_at'));
export const getResearchIdeas = (s: Db) => rows<T.ResearchIdea>(s.from('research_ideas').select('id,project_id,content,source,status').order('created_at'));
export const getReadings = (s: Db) => rows<T.Reading>(s.from('readings').select('id,title,authors,year,doi,verification_status').order('created_at'));
export const getSupervisions = (s: Db) => rows<T.Supervision>(s.from('supervisions').select('id,met_on,supervisor,points,status,next_on').order('met_on'));

/** Semua sumber kalender sekaligus. */
export async function getCalendarSources(s: Db) {
  const [semesters, courses, schedules, tasks, slots, holidays, events, targets, supervisions, bills, sinking] = await Promise.all([
    getSemesters(s), getCourses(s), getSchedules(s), getTasks(s), getWorkSlots(s), getHolidays(s), getEvents(s),
    getResearchTargets(s), getSupervisions(s), getBills(s), getSinkingFunds(s),
  ]);
  return { semesters, courses, schedules, tasks, slots, holidays, events, targets, supervisions, bills, sinking };
}

/** Transaksi ringan sejak tanggal (WIB) tertentu, untuk grafik dan ringkasan. */
export const getTransactionsSince = (s: Db, date: string) =>
  rows<import('@/lib/finance').TxLite>(
    s.from('transactions').select('kind,amount,account_id,to_account_id,category_id,occurred_at').gte('occurred_at', zonedToIso(date)).order('occurred_at'),
  );

async function count(q: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count: c, error } = await q;
  if (error) throw new Error(`Gagal memuat data: ${error.message}`);
  return c ?? 0;
}
export const countProposedActions = (s: Db) => count(s.from('agent_actions').select('id', { count: 'exact', head: true }).eq('status', 'proposed'));
export const countUnreadNotifications = (s: Db) => count(s.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null));
export const countDueVocab = (s: Db) => count(s.from('vocab').select('id', { count: 'exact', head: true }).lte('due_at', new Date().toISOString()));
export const countVocab = (s: Db) => count(s.from('vocab').select('id', { count: 'exact', head: true }));
export const countActiveAutomations = (s: Db) => count(s.from('automations').select('id', { count: 'exact', head: true }).eq('is_enabled', true));

export type MemoryRow = { id: string; kind: string; key: string; value: unknown; last_used_at: string | null };
export const getAgentMemory = (s: Db) => rows<MemoryRow>(s.from('agent_memory').select('id,kind,key,value,last_used_at').order('kind').order('key'));

export type LastImport = { created_at: string; exported_at: string | null };
export async function getLastImport(s: Db): Promise<LastImport | null> {
  const { data } = await s.from('legacy_imports').select('created_at,exported_at').order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data as LastImport | null) ?? null;
}

/** Nilai pengaturan (tabel settings) sebagai objek key → value. */
export async function getSettings(s: Db, keys: string[]): Promise<Record<string, unknown>> {
  const { data, error } = await s.from('settings').select('key,value').in('key', keys);
  if (error) throw new Error(`Gagal memuat pengaturan: ${error.message}`);
  return Object.fromEntries((data ?? []).map((r) => [r.key as string, r.value]));
}

export { addDays };
