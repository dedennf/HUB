import type { Metadata } from 'next';
import { Empty, PageTitle, Section } from '@/components/ui';
import { db, getCourses, getSchedules, getSemesters, getTasks } from '@/lib/data';
import { formatDateId, relativeDay, todayIso, WEEKDAYS_ID, zonedParts } from '@/lib/time';

export const metadata: Metadata = { title: 'Kuliah' };

const KIND = { assignment: 'Tugas', exam: 'Ujian', quiz: 'Kuis', practicum: 'Praktikum' } as Record<string, string>;
const STATUS = { todo: 'Belum', in_progress: 'Dikerjakan', done: 'Selesai', overdue: 'Terlambat' } as Record<string, string>;

export default async function KuliahPage() {
  const s = await db();
  const [semesters, courses, schedules, tasks] = await Promise.all([getSemesters(s), getCourses(s), getSchedules(s), getTasks(s)]);
  const today = todayIso();
  const active = semesters.find((x) => x.is_active);
  const shown = courses.filter((c) => !active || c.semester_id === active.id);
  const course = new Map(courses.map((c) => [c.id, c]));
  const open = tasks.filter((t) => t.status !== 'done');
  const done = tasks.filter((t) => t.status === 'done');

  return (
    <>
      <PageTitle title="Kuliah" kicker={active ? `${active.name}${active.start_date && active.end_date ? ` · ${formatDateId(active.start_date)} sampai ${formatDateId(active.end_date)}` : ' · tanggal belum diatur'}` : 'Belum ada semester aktif'} />
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Tugas belum selesai">
          {open.length ? (
            <div className="list">
              {open.map((t) => {
                const d = t.due_at ? zonedParts(t.due_at).date : null;
                const late = d && d < today;
                return (
                  <div key={t.id} className="row">
                    <span>
                      <span className="block font-medium">{t.title}</span>
                      <span className="block text-xs text-muted">{[course.get(t.course_id ?? '')?.name, KIND[t.kind], t.priority === 'high' ? 'Prioritas tinggi' : '', STATUS[t.status]].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className={`text-xs ${late ? 'text-danger' : 'text-muted'}`}>{d ? `${formatDateId(d)} · ${relativeDay(d, today)}` : 'tanpa tenggat'}</span>
                  </div>
                );
              })}
            </div>
          ) : <Empty>Semua tugas beres.</Empty>}
          {done.length > 0 && <p className="mt-2 text-xs text-muted">{done.length} tugas sudah selesai.</p>}
        </Section>
        <Section title="Jadwal mingguan">
          {WEEKDAYS_ID.map((day, i) => {
            const list = schedules.filter((x) => x.weekday === i + 1 && shown.some((c) => c.id === x.course_id));
            if (!list.length) return null;
            return (
              <div key={day} className="mb-2">
                <div className="text-xs font-medium text-muted">{day}</div>
                {list.map((x) => (
                  <div key={x.id} className="row text-sm">
                    <span>{course.get(x.course_id)?.name}{x.location ? <span className="text-xs text-muted"> · {x.location}</span> : null}</span>
                    <span className="text-xs text-muted">{x.start_time.slice(0, 5)}–{x.end_time.slice(0, 5)}</span>
                  </div>
                ))}
              </div>
            );
          })}
          {!schedules.length && <Empty>Belum ada jadwal kelas.</Empty>}
        </Section>
        <Section title="Mata kuliah">
          {shown.length ? (
            <div className="list">
              {shown.map((c) => (
                <div key={c.id} className="row">
                  <span>{c.name}{c.alias ? <span className="text-xs text-muted"> ({c.alias})</span> : null}<span className="block text-xs text-muted">{c.lecturer ?? ''}</span></span>
                  <span className="text-xs text-muted">{c.credits ?? '-'} SKS</span>
                </div>
              ))}
            </div>
          ) : <Empty>Belum ada mata kuliah.</Empty>}
          <p className="mt-2 text-xs text-muted">Menambah dan mengubah data kuliah dari layar ini hadir di Fase 1b.</p>
        </Section>
      </div>
    </>
  );
}
