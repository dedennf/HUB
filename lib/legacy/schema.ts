// Skema file cadangan app lama "Hub Pribadi" (format { app: 'hub-pribadi', version: 1, data }).
// Sengaja longgar: field yang hilang diberi nilai kosong, field tak dikenal dibuang.
import { z } from 'zod';

const str = z.preprocess((v) => (v == null ? '' : String(v)), z.string());
const num = z.preprocess((v) => (v === '' || v == null ? 0 : Number(v)), z.number().catch(0));
const optNum = z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().nullable().catch(null));
const bool = z.preprocess((v) => v === true || v === 'true', z.boolean());
const strList = z.preprocess(
  (v) => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',') : []),
  z.array(z.string()),
).transform((a) => a.map((s) => s.trim()).filter(Boolean));

const rec = <T extends z.ZodRawShape>(shape: T) => z.object({ id: z.string().min(1), _u: num, ...shape });
const list = <T extends z.ZodTypeAny>(item: T) => z.array(item).default([]);

export const legacyAccount = rec({ name: str, type: str, alias: str, open: num, archived: bool });
export const legacyCategory = rec({
  kind: str, name: str, icon: str, color: str, keywords: strList, subs: strList, hidden: bool, builtin: bool, order: num,
});
export const legacyTransaction = rec({
  type: str, date: str, amount: num, acc: str, to: str, cat: str, sub: str, note: str, group: str,
});
export const legacyInvestment = rec({ name: str, kind: str, platform: str, cost: num, value: num, note: str });
export const legacyBudget = rec({ cat: str, limit: num });
export const legacyBill = rec({
  name: str, amount: num, freq: str, nextDue: str, cat: str, acc: str, note: str,
  active: z.preprocess((v) => v !== false, z.boolean()),
});
export const legacyGoal = rec({ name: str, target: num, saved: num, deadline: str, note: str });
export const legacyDebt = rec({ dir: str, person: str, amount: num, paid: num, date: str, due: str, note: str });
export const legacyTrueExp = rec({ name: str, amount: num, due: str, saved: num, note: str, done: bool });
export const legacyCourse = rec({ name: str, alias: str, sem: optNum, sks: optNum, lecturer: str, note: str });
export const legacySchedule = rec({ course: str, day: num, start: str, end: str, room: str });
export const legacyTask = rec({
  title: str, kind: str, course: str, due: str, work: str, workStart: str, workEnd: str,
  prio: str, parent: str, link: str, note: str, done: bool, doneAt: str,
});
export const legacyMaterial = rec({ title: str, course: str, meeting: optNum, type: str, url: str, tags: strList, note: str });
export const legacyHoliday = rec({ name: str, start: str, end: str });
export const legacyMilestone = rec({ title: str, due: str, pct: num, note: str });
export const legacyNeed = rec({ title: str, kind: str, status: str, note: str });
export const legacyIdea = rec({ title: str, origin: str, status: str, note: str });
export const legacyLiterature = rec({
  title: str, authors: str, year: optNum, venue: str, doi: str, col: str, tags: strList, claim: str,
  st: str, inc: str, note: str, ideas: strList, ms: strList,
});
export const legacyBimbingan = rec({ date: str, with: str, points: str, status: str, nextDate: str });
export const legacyEvent = rec({
  title: str, date: str, endDate: str, time: str, endTime: str, place: str, repeat: str, until: str, note: str,
});

export const KNOWN_COLLECTIONS = [
  'courses', 'tasks', 'materials', 'schedule', 'holidays', 'needs', 'ideas', 'milestones', 'literature', 'bimbingan',
  'events', 'accounts', 'categories', 'transactions', 'investments', 'budgets', 'goals', 'debts', 'bills', 'trueExp', 'aiLog',
] as const;

export const legacyBackup = z.object({
  app: z.literal('hub-pribadi'),
  version: z.literal(1),
  exported: z.string().optional(),
  data: z.looseObject({
    settings: z.looseObject({
      sem: optNum, semStart: str, semEnd: str, created: str, geminiNotes: str,
    }).default({ sem: null, semStart: '', semEnd: '', created: '', geminiNotes: '' }),
    accounts: list(legacyAccount),
    categories: list(legacyCategory),
    transactions: list(legacyTransaction),
    investments: list(legacyInvestment),
    budgets: list(legacyBudget),
    bills: list(legacyBill),
    goals: list(legacyGoal),
    debts: list(legacyDebt),
    trueExp: list(legacyTrueExp),
    courses: list(legacyCourse),
    schedule: list(legacySchedule),
    tasks: list(legacyTask),
    materials: list(legacyMaterial),
    holidays: list(legacyHoliday),
    milestones: list(legacyMilestone),
    needs: list(legacyNeed),
    ideas: list(legacyIdea),
    literature: list(legacyLiterature),
    bimbingan: list(legacyBimbingan),
    events: list(legacyEvent),
  }),
});

export type LegacyBackup = z.infer<typeof legacyBackup>;

/** Pilihan pengguna di layar pratinjau impor (D-15). */
export const importOverrides = z.object({
  transactionDates: z.record(z.string(), z.string()).default({}),
  semesterDates: z.record(z.string(), z.object({ start: z.string(), end: z.string() })).default({}),
  billAccounts: z.record(z.string(), z.string()).default({}),
});
export type ImportOverrides = z.infer<typeof importOverrides>;
