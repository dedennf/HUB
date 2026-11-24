// Tools kalender (SPEC 6.8).
import { z } from 'zod';
import { buildCalendarItems, type CalendarItem, type CalendarSources } from '../../calendar';
import { addDays, diffDays, zonedParts } from '../../time';
import { resolveTask } from '../resolve';
import { dateStr, insertRow, isErr, pick, toIso, when } from './common';
import { fail, type ReadTool, type ToolCtx, type WriteTool } from './types';

async function loadSources(ctx: ToolCtx): Promise<CalendarSources> {
  const q = (t: string, cols: string) => ctx.db.from(t).select(cols).then((r) => (r.data ?? []) as never[]);
  const [semesters, courses, schedules, tasks, slots, holidays, events, targets, supervisions, bills, sinking] = await Promise.all([
    q('semesters', 'id,name,number,start_date,end_date,is_active'), q('courses', 'id,semester_id,name,alias,lecturer,credits'),
    q('course_schedules', 'id,course_id,weekday,start_time,end_time,location'), q('tasks', 'id,course_id,parent_id,title,kind,priority,due_at,status,description'),
    q('task_work_slots', 'id,task_id,start_at,end_at'), q('holidays', 'id,name,start_date,end_date'),
    q('events', 'id,title,start_at,end_at,is_all_day,location,recurrence,recurrence_until'), q('research_targets', 'id,project_id,title,due_date,progress'),
    q('supervisions', 'id,met_on,supervisor,points,status,next_on'), q('bills', 'id,name,amount,frequency,next_due_date,default_account_id,category_id,is_active,note'),
    q('sinking_funds', 'id,name,amount,saved_amount,due_on,is_done'),
  ]);
  return { semesters, courses, schedules, tasks, slots, holidays, events, targets, supervisions, bills, sinking };
}

const rangeParams = z.object({ from: dateStr('Mulai'), to: dateStr('Sampai') });
export const getCalendar: ReadTool<typeof rangeParams> = {
  name: 'get_calendar', module: 'calendar', permission: 'read',
  description: 'Kalender gabungan dalam rentang tanggal (maks 62 hari): kuliah, tenggat tugas, slot pengerjaan, target riset, bimbingan, tagihan, libur, dan acara.',
  parameters: rangeParams,
  async run(ctx, { from, to }) {
    if (to < from) return fail('Tanggal akhir sebelum tanggal awal.');
    if (diffDays(to, from) > 62) return fail('Rentang maksimal 62 hari.');
    const items = buildCalendarItems(await loadSources(ctx), from, to);
    return { ok: true, data: Object.fromEntries([...items].map(([d, list]) => [d, list.map(({ color: _c, ...i }) => { void _c; return i; })])) };
  },
};

export type FreeSlot = { date: string; start: string; end: string; minutes: number };
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Celah kosong per hari dalam jam aktif (07.00 sampai 22.00), dikurangi item yang punya jam. Fungsi murni. */
export function freeSlots(items: Map<string, CalendarItem[]>, from: string, to: string, minMinutes: number, now: { date: string; time: string }, day = { start: '07:00', end: '22:00' }): FreeSlot[] {
  const out: FreeSlot[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (d < now.date) continue;
    const list = items.get(d) ?? [];
    const busy = list.filter((i) => i.time).map((i) => [toMin(i.time!), toMin(i.endTime ?? i.time!) || toMin(i.time!) + 60] as [number, number])
      .map(([s, e]) => [s, e > s ? e : s + 60] as [number, number]).sort((a, b) => a[0] - b[0]);
    let cursor = Math.max(toMin(day.start), d === now.date ? Math.ceil((toMin(now.time) + 1) / 15) * 15 : 0);
    const end = toMin(day.end);
    for (const [s, e] of [...busy, [end, end] as [number, number]]) {
      const gapEnd = Math.min(s, end);
      if (gapEnd - cursor >= minMinutes) out.push({ date: d, start: toHm(cursor), end: toHm(gapEnd), minutes: gapEnd - cursor });
      cursor = Math.max(cursor, e);
      if (cursor >= end) break;
    }
  }
  return out;
}

const freeParams = z.object({ from: dateStr('Mulai'), to: dateStr('Sampai'), min_minutes: z.number().int().min(15).max(600).describe('Durasi minimal slot dalam menit') });
export const findFreeSlots: ReadTool<typeof freeParams> = {
  name: 'find_free_slots', module: 'calendar', permission: 'read',
  description: 'Cari waktu kosong (jam 07.00 sampai 22.00) di antara kelas, acara, dan slot kerja, untuk menjadwalkan pengerjaan tugas.',
  parameters: freeParams,
  async run(ctx, a) {
    if (a.to < a.from || diffDays(a.to, a.from) > 31) return fail('Rentang tidak valid (maks 31 hari).');
    const items = buildCalendarItems(await loadSources(ctx), a.from, a.to);
    return { ok: true, data: freeSlots(items, a.from, a.to, a.min_minutes, zonedParts(ctx.now)).slice(0, 30) };
  },
};

const workParams = z.object({ task: z.string().describe('Judul atau id tugas'), start_at: when('Mulai'), end_at: when('Selesai') });
export const scheduleTaskWork: WriteTool<typeof workParams, Record<string, unknown>> = {
  name: 'schedule_task_work', module: 'calendar', permission: 'write',
  description: 'Jadwalkan waktu mengerjakan sebuah tugas (muncul di Agenda). Cek dulu dengan find_free_slots.',
  parameters: workParams,
  async prepare(ctx, a) {
    const r = pick(await resolveTask(ctx.db, a.task), 'task', 'tugas', a.task);
    if (isErr(r)) return r;
    const s = toIso(a.start_at)!; const e = toIso(a.end_at)!;
    if (e <= s) return fail('Waktu selesai harus setelah waktu mulai.', { field: 'end_at' });
    const ps = zonedParts(s); const pe = zonedParts(e);
    return { ok: true, summary: `Kerjakan ${r.label} · ${ps.date} ${ps.time.replace(':', '.')}–${pe.time.replace(':', '.')}`, resolved: { task_id: r.id, start_at: s, end_at: e, suggested_by_agent: true } };
  },
  async commit(ctx, r) {
    const res = await insertRow(ctx, 'task_work_slots', r);
    if (isErr(res)) return res;
    return { ok: true, data: { id: res.id }, undo: { ops: [res.undo] } };
  },
};

const eventParams = z.object({
  title: z.string().min(1).max(160),
  start_at: when('Mulai. Tanpa jam = sepanjang hari'),
  end_at: when('Selesai').optional(),
  location: z.string().max(120).optional(),
  recurrence: z.enum(['none', 'daily', 'weekly', 'monthly', 'yearly']).optional(),
  recurrence_until: dateStr('Berulang sampai').optional(),
});
export const addEvent: WriteTool<typeof eventParams, Record<string, unknown>> = {
  name: 'add_event', module: 'calendar', permission: 'write',
  description: 'Tambah acara bebas di kalender (rapat, janji, kegiatan), bisa berulang.',
  parameters: eventParams,
  async prepare(ctx, a) {
    const allDay = /^\d{4}-\d{2}-\d{2}$/.test(a.start_at.trim());
    const s = toIso(a.start_at, '00:00')!;
    const e = a.end_at ? toIso(a.end_at, '23:59') : null;
    if (e && e < s) return fail('Waktu selesai sebelum waktu mulai.', { field: 'end_at' });
    const p = zonedParts(s);
    return {
      ok: true, summary: `Acara ${a.title} · ${p.date}${allDay ? '' : ` ${p.time.replace(':', '.')}`}${a.location ? ` · ${a.location}` : ''}${a.recurrence && a.recurrence !== 'none' ? ' · berulang' : ''}`,
      resolved: { title: a.title, start_at: s, end_at: e, is_all_day: allDay, location: a.location ?? null, recurrence: a.recurrence ?? 'none', recurrence_until: a.recurrence_until ?? null },
    };
  },
  async commit(ctx, r) {
    const res = await insertRow(ctx, 'events', r);
    if (isErr(res)) return res;
    return { ok: true, data: { id: res.id }, undo: { ops: [res.undo] } };
  },
};

export const calendarTools = [getCalendar, findFreeSlots, scheduleTaskWork, addEvent];
