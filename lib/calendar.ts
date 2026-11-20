// Kalender gabungan (SPEC 5.4): menggabungkan semua sumber per hari dalam zona aplikasi.
// Fungsi murni supaya bisa diuji tanpa database.
import { addDays, diffDays, isoWeekday, zonedParts } from './time';
import type * as T from './types';

export type CalendarItemType = 'kelas' | 'tugas' | 'ujian' | 'kerjakan' | 'riset' | 'bimbingan' | 'tagihan' | 'libur' | 'acara';

export type CalendarItem = {
  type: CalendarItemType; title: string; subtitle?: string; date: string; time?: string; endTime?: string;
  done?: boolean; ref_table: string; ref_id: string; color: string;
};

export const CALENDAR_TYPES: Record<CalendarItemType, { label: string; color: string }> = {
  kelas: { label: 'Kuliah', color: '#2f7fb8' },
  tugas: { label: 'Tenggat tugas', color: '#d9822b' },
  kerjakan: { label: 'Dikerjakan', color: '#5a7bd8' },
  ujian: { label: 'Ujian', color: '#c0504d' },
  riset: { label: 'Riset', color: '#0f7b6c' },
  bimbingan: { label: 'Bimbingan', color: '#7a5ea8' },
  tagihan: { label: 'Tagihan', color: '#8a6d3b' },
  libur: { label: 'Libur', color: '#7d8590' },
  acara: { label: 'Acara', color: '#c2410c' },
};

export type CalendarSources = {
  semesters: T.Semester[]; courses: T.Course[]; schedules: T.CourseSchedule[]; tasks: T.Task[]; slots: T.TaskWorkSlot[];
  holidays: T.Holiday[]; events: T.CalendarEvent[]; targets: T.ResearchTarget[]; supervisions: T.Supervision[];
  bills: T.Bill[]; sinking: T.SinkingFund[];
};

const hhmm = (t: string) => t.slice(0, 5);

function eventStartsOn(e: T.CalendarEvent, startDate: string, day: string): boolean {
  if (day < startDate) return false;
  if (e.recurrence_until && day > e.recurrence_until) return false;
  switch (e.recurrence) {
    case 'daily': return true;
    case 'weekly': return isoWeekday(day) === isoWeekday(startDate);
    case 'monthly': return day.slice(8) === startDate.slice(8);
    case 'yearly': return day.slice(5) === startDate.slice(5);
    default: return day === startDate;
  }
}

export function buildCalendarItems(src: CalendarSources, from: string, to: string): Map<string, CalendarItem[]> {
  const out = new Map<string, CalendarItem[]>();
  const add = (item: Omit<CalendarItem, 'color'>) => {
    if (item.date < from || item.date > to) return;
    const list = out.get(item.date) ?? [];
    list.push({ ...item, color: CALENDAR_TYPES[item.type].color });
    out.set(item.date, list);
  };
  const courseById = new Map(src.courses.map((c) => [c.id, c]));
  const active = src.semesters.find((s) => s.is_active) ?? null;

  for (let day = from; day <= to; day = addDays(day, 1)) {
    const holiday = src.holidays.find((h) => day >= h.start_date && day <= (h.end_date ?? h.start_date));
    if (holiday) add({ type: 'libur', title: holiday.name, date: day, ref_table: 'holidays', ref_id: holiday.id });

    const inSemester = active && (!active.start_date || day >= active.start_date) && (!active.end_date || day <= active.end_date);
    if (!holiday && inSemester) {
      const wd = isoWeekday(day);
      for (const s of src.schedules) {
        const course = courseById.get(s.course_id);
        if (s.weekday !== wd || !course || course.semester_id !== active.id) continue;
        add({ type: 'kelas', title: course.name, subtitle: s.location ?? undefined, date: day, time: hhmm(s.start_time), endTime: hhmm(s.end_time), ref_table: 'course_schedules', ref_id: s.id });
      }
    }

    for (const e of src.events) {
      const start = zonedParts(e.start_at);
      const end = e.end_at ? zonedParts(e.end_at) : null;
      const span = end && end.date > start.date ? Math.min(60, diffDays(end.date, start.date)) : 0;
      for (let k = 0; k <= span; k++) {
        if (eventStartsOn(e, start.date, addDays(day, -k))) {
          const first = k === 0;
          const last = k === span;
          const multi = span > 0;
          add({
            type: 'acara', title: e.title, date: day,
            subtitle: [
              e.location,
              multi ? `hari ${k + 1} dari ${span + 1}` : '',
              multi && last && end && !e.is_all_day ? `sampai ${end.time}` : '',
              e.recurrence !== 'none' ? 'berulang' : '',
            ].filter(Boolean).join(' · ') || undefined,
            time: e.is_all_day || !first ? undefined : start.time,
            endTime: end && !e.is_all_day && first && !multi ? end.time : undefined,
            ref_table: 'events', ref_id: e.id,
          });
          break;
        }
      }
    }
  }

  const taskById = new Map(src.tasks.map((t) => [t.id, t]));
  for (const t of src.tasks) {
    if (!t.due_at) continue;
    add({
      type: t.kind === 'exam' ? 'ujian' : 'tugas', title: t.title, subtitle: courseById.get(t.course_id ?? '')?.name,
      date: zonedParts(t.due_at).date, done: t.status === 'done', ref_table: 'tasks', ref_id: t.id,
    });
  }
  for (const s of src.slots) {
    const t = taskById.get(s.task_id);
    if (!t || t.status === 'done') continue;
    const st = zonedParts(s.start_at);
    add({ type: 'kerjakan', title: `Kerjakan: ${t.title}`, date: st.date, time: st.time, endTime: zonedParts(s.end_at).time, ref_table: 'tasks', ref_id: t.id });
  }
  for (const r of src.targets) {
    if (r.due_date) add({ type: 'riset', title: r.title, subtitle: `${r.progress}%`, date: r.due_date, done: r.progress >= 100, ref_table: 'research_targets', ref_id: r.id });
  }
  for (const b of src.supervisions) {
    if (b.met_on) add({ type: 'bimbingan', title: `Bimbingan${b.supervisor ? ': ' + b.supervisor : ''}`, date: b.met_on, ref_table: 'supervisions', ref_id: b.id });
    if (b.next_on) add({ type: 'bimbingan', title: `Bimbingan berikutnya${b.supervisor ? ': ' + b.supervisor : ''}`, date: b.next_on, ref_table: 'supervisions', ref_id: b.id });
  }
  for (const b of src.bills) {
    if (b.is_active && b.next_due_date) add({ type: 'tagihan', title: b.name, date: b.next_due_date, ref_table: 'bills', ref_id: b.id });
  }
  for (const f of src.sinking) {
    if (!f.is_done && f.due_on) add({ type: 'tagihan', title: f.name, date: f.due_on, ref_table: 'sinking_funds', ref_id: f.id });
  }

  for (const list of out.values()) list.sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
  return out;
}
