// Tools kuliah (SPEC 6.8).
import { z } from 'zod';
import { addDays, isoWeekday, zonedParts, zonedToIso } from '../../time';
import { resolveCourse, resolveTask } from '../resolve';
import { dateStr, insertRow, isErr, pick, timeStr, toIso, updateRow, when } from './common';
import { fail, type ReadTool, type UndoOp, type WriteTool } from './types';

const KIND = { assignment: 'Tugas', exam: 'Ujian', quiz: 'Kuis', practicum: 'Praktikum' } as const;
const WEEKDAY: Record<string, number> = { senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, sabtu: 6, minggu: 7 };

const tasksParams = z.object({
  status: z.enum(['todo', 'in_progress', 'done', 'overdue', 'open']).optional().describe('open = semua yang belum selesai (bawaan)'),
  due_within_days: z.number().int().min(0).max(365).optional(),
  course: z.string().optional().describe('Nama, singkatan, atau kode mata kuliah'),
});
export const getTasks: ReadTool<typeof tasksParams> = {
  name: 'get_tasks', module: 'academic', permission: 'read',
  description: 'Daftar tugas, ujian, kuis, praktikum dengan tenggat. Bisa disaring status, tenggat N hari ke depan, dan mata kuliah.',
  parameters: tasksParams,
  async run(ctx, a) {
    let q = ctx.db.from('tasks').select('id,title,kind,status,priority,due_at,course_id').is('parent_id', null).order('due_at', { nullsFirst: false }).limit(50);
    const st = a.status ?? 'open';
    if (st === 'open') q = q.neq('status', 'done'); else if (st !== 'overdue') q = q.eq('status', st);
    if (st === 'overdue') q = q.neq('status', 'done').lt('due_at', zonedToIso(ctx.today));
    if (a.due_within_days != null) q = q.lt('due_at', zonedToIso(addDays(ctx.today, a.due_within_days + 1)));
    if (a.course) { const r = pick(await resolveCourse(ctx.db, a.course), 'course', 'mata kuliah', a.course); if (isErr(r)) return r; q = q.eq('course_id', r.id); }
    const [{ data }, { data: courses }] = await Promise.all([q, ctx.db.from('courses').select('id,name')]);
    const cn = new Map((courses ?? []).map((c) => [c.id, c.name]));
    return { ok: true, data: (data ?? []).map((t) => ({ ...t, course: t.course_id ? cn.get(t.course_id) : null, due: t.due_at ? zonedParts(t.due_at) : null, overdue: !!t.due_at && t.status !== 'done' && zonedParts(t.due_at).date < ctx.today })) };
  },
};

export const getCourseSchedule: ReadTool<z.ZodObject<{ date: z.ZodOptional<z.ZodString> }>> = {
  name: 'get_course_schedule', module: 'academic', permission: 'read',
  description: 'Jadwal kuliah pada satu tanggal (bawaan hari ini) dari semester aktif. Hari libur dan tanggal di luar semester tidak punya kelas.',
  parameters: z.object({ date: dateStr('Tanggal').optional() }),
  async run(ctx, { date }) {
    const d = date ?? ctx.today;
    const { data: sem } = await ctx.db.from('semesters').select('id,start_date,end_date').eq('is_active', true).maybeSingle();
    if (!sem) return { ok: true, data: { date: d, classes: [], note: 'Belum ada semester aktif.' } };
    if ((sem.start_date && d < sem.start_date) || (sem.end_date && d > sem.end_date)) return { ok: true, data: { date: d, classes: [], note: 'Di luar masa semester.' } };
    const { data: hol } = await ctx.db.from('holidays').select('name,start_date,end_date').lte('start_date', d);
    const holiday = (hol ?? []).find((h) => d <= (h.end_date ?? h.start_date));
    if (holiday) return { ok: true, data: { date: d, classes: [], note: `Libur: ${holiday.name}` } };
    const { data: courses } = await ctx.db.from('courses').select('id,name').eq('semester_id', sem.id);
    const ids = (courses ?? []).map((c) => c.id);
    const { data: sch } = ids.length ? await ctx.db.from('course_schedules').select('course_id,start_time,end_time,location').in('course_id', ids).eq('weekday', isoWeekday(d)).order('start_time') : { data: [] };
    const cn = new Map((courses ?? []).map((c) => [c.id, c.name]));
    return { ok: true, data: { date: d, classes: (sch ?? []).map((s) => ({ course: cn.get(s.course_id), start: String(s.start_time).slice(0, 5), end: String(s.end_time).slice(0, 5), location: s.location })) } };
  },
};

const addTaskParams = z.object({
  title: z.string().min(1).max(160),
  course: z.string().optional().describe('Nama, singkatan, atau kode mata kuliah'),
  due_at: when('Tenggat. "Jumat jam 12 malam" = 23:59 hari itu').optional(),
  kind: z.enum(['assignment', 'exam', 'quiz', 'practicum']).optional(),
  estimated_minutes: z.number().int().min(5).max(6000).optional(),
  description: z.string().max(2000).optional(),
});
export const addTask: WriteTool<typeof addTaskParams, Record<string, unknown>> = {
  name: 'add_task', module: 'academic', permission: 'write',
  description: 'Tambah tugas, ujian, kuis, atau praktikum beserta tenggatnya. Bila jam tenggat tidak disebut, pakai 23:59.',
  parameters: addTaskParams,
  async prepare(ctx, a) {
    let courseId: string | null = null; let courseLabel = 'Umum';
    if (a.course) { const r = pick(await resolveCourse(ctx.db, a.course), 'course', 'mata kuliah', a.course); if (isErr(r)) return r; courseId = r.id; courseLabel = r.label; }
    const due = a.due_at ? toIso(a.due_at, '23:59') : null;
    const kind = a.kind ?? 'assignment';
    return {
      ok: true, summary: `${KIND[kind]} baru: ${a.title} · ${courseLabel}${due ? ` · tenggat ${zonedParts(due).date} ${zonedParts(due).time.replace(':', '.')}` : ''}`,
      resolved: { title: a.title, course_id: courseId, kind, due_at: due, estimated_minutes: a.estimated_minutes ?? null, description: a.description ?? null },
    };
  },
  async commit(ctx, r) {
    const res = await insertRow(ctx, 'tasks', r);
    if (isErr(res)) return res;
    return { ok: true, data: { id: res.id }, undo: { ops: [res.undo] } };
  },
};

const completeParams = z.object({ task_id: z.uuid().optional(), title: z.string().optional().describe('Judul tugas bila id tidak diketahui') });
export const completeTask: WriteTool<typeof completeParams, { id: string }> = {
  name: 'complete_task', module: 'academic', permission: 'write',
  description: 'Tandai tugas selesai.',
  parameters: completeParams,
  async prepare(ctx, a) {
    const q = a.task_id ?? a.title;
    if (!q) return fail('Sebutkan task_id atau title.', { field: 'title' });
    const r = pick(await resolveTask(ctx.db, q), 'title', 'tugas', q);
    if (isErr(r)) return r;
    return { ok: true, summary: `Selesai: ${r.label}`, resolved: { id: r.id } };
  },
  async commit(ctx, { id }) {
    const u = await updateRow(ctx, 'tasks', id, { status: 'done', completed_at: ctx.now.toISOString() });
    if (isErr(u)) return u;
    return { ok: true, data: { id }, undo: { ops: [u] } };
  },
};

const matParams = z.object({ course: z.string(), title: z.string().min(1).max(200), url: z.string().max(500).optional(), notes: z.string().max(2000).optional() });
export const addMaterial: WriteTool<typeof matParams, Record<string, unknown>> = {
  name: 'add_material', module: 'academic', permission: 'write',
  description: 'Simpan materi kuliah (slide, jurnal, video, catatan) untuk sebuah mata kuliah.',
  parameters: matParams,
  async prepare(ctx, a) {
    const r = pick(await resolveCourse(ctx.db, a.course), 'course', 'mata kuliah', a.course);
    if (isErr(r)) return r;
    return { ok: true, summary: `Materi ${a.title} · ${r.label}`, resolved: { course_id: r.id, title: a.title, url: a.url ?? null, notes: a.notes ?? null } };
  },
  async commit(ctx, r) {
    const res = await insertRow(ctx, 'materials', r);
    if (isErr(res)) return res;
    return { ok: true, data: { id: res.id }, undo: { ops: [res.undo] } };
  },
};

const schedItem = z.object({
  weekday: z.union([z.number().int().min(1).max(7), z.string()]).describe('1 = Senin ... 7 = Minggu, atau nama hari'),
  start_time: timeStr('Jam mulai'), end_time: timeStr('Jam selesai'), location: z.string().max(60).optional(),
});
const courseParams = z.object({
  name: z.string().min(1).max(120),
  alias: z.string().max(40).optional(),
  credits: z.number().int().min(0).max(12).optional(),
  lecturer: z.string().max(120).optional(),
  semester: z.number().int().min(1).max(16).optional().describe('Nomor semester, bawaan semester aktif'),
  schedules: z.array(schedItem).max(7).optional(),
});
type CourseResolved = { course: Record<string, unknown>; schedules: { weekday: number; start_time: string; end_time: string; location: string | null }[] };
export const addCourse: WriteTool<typeof courseParams, CourseResolved> = {
  name: 'add_course', module: 'academic', permission: 'write',
  description: 'Tambah mata kuliah beserta jadwal mingguannya (opsional).',
  parameters: courseParams,
  async prepare(ctx, a) {
    let semId: string | null = null;
    if (a.semester) { const { data } = await ctx.db.from('semesters').select('id').eq('number', a.semester).maybeSingle(); semId = data?.id ?? null; }
    if (!semId) { const { data } = await ctx.db.from('semesters').select('id').eq('is_active', true).maybeSingle(); semId = data?.id ?? null; }
    const schedules: CourseResolved['schedules'] = [];
    for (const s of a.schedules ?? []) {
      const wd = typeof s.weekday === 'number' ? s.weekday : WEEKDAY[s.weekday.toLowerCase().replace(/[^a-z]/g, '')];
      if (!wd) return fail(`Hari "${s.weekday}" tidak dikenal.`, { field: 'schedules' });
      if (s.end_time <= s.start_time) return fail('Jam selesai harus setelah jam mulai.', { field: 'schedules' });
      schedules.push({ weekday: wd, start_time: s.start_time, end_time: s.end_time, location: s.location ?? null });
    }
    const days = ['', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    return {
      ok: true, summary: `Mata kuliah ${a.name}${a.credits ? ` · ${a.credits} SKS` : ''}${schedules.length ? ` · ${schedules.map((s) => `${days[s.weekday]} ${s.start_time.replace(':', '.')}`).join(', ')}` : ''}`,
      resolved: { course: { name: a.name, alias: a.alias ?? null, credits: a.credits ?? null, lecturer: a.lecturer ?? null, semester_id: semId }, schedules },
    };
  },
  async commit(ctx, r) {
    const c = await insertRow(ctx, 'courses', r.course);
    if (isErr(c)) return c;
    const ops: UndoOp[] = [c.undo]; // menghapus mata kuliah ikut menghapus jadwalnya (cascade)
    for (const s of r.schedules) {
      const res = await insertRow(ctx, 'course_schedules', { ...s, course_id: c.id });
      if (isErr(res)) { await ctx.db.from('courses').delete().eq('id', c.id); return res; }
    }
    return { ok: true, data: { id: c.id }, undo: { ops } };
  },
};

export const academicTools = [getTasks, getCourseSchedule, addTask, completeTask, addMaterial, addCourse];
