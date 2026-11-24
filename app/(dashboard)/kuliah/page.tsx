import type { Metadata } from 'next';
import { ClassCard } from '@/components/ui/ClassCard';
import { EmptyState, PageHeader, Section } from '@/components/ui/Section';
import { TaskRow } from '@/components/ui/TaskRow';
import { db, getCourses, getSchedules, getSemesters, getTasks } from '@/lib/data';
import { formatDayMonth } from '@/lib/format';
import { taskRowProps } from '@/lib/task-view';
import { todayIso, WEEKDAYS_ID } from '@/lib/time';

export const metadata: Metadata = { title: 'Kuliah' };

export default async function KuliahPage() {
  const s = await db();
  const [semesters, courses, schedules, tasks] = await Promise.all([getSemesters(s), getCourses(s), getSchedules(s), getTasks(s)]);
  const today = todayIso();
  const active = semesters.find((x) => x.is_active);
  const shown = courses.filter((c) => !active || c.semester_id === active.id);
  const byId = new Map(courses.map((c) => [c.id, c]));
  const roots = tasks.filter((t) => !t.parent_id);
  const open = roots.filter((t) => t.status !== 'done').sort((a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'));
  const done = roots.filter((t) => t.status === 'done');
  const kicker = active
    ? `${active.name}${active.start_date && active.end_date ? ` · ${formatDayMonth(active.start_date)} sampai ${formatDayMonth(active.end_date)}` : ' · tanggal semester belum diatur'}`
    : 'Belum ada semester aktif';

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Kuliah" kicker={kicker} back={{ href: '/kalender', label: 'Agenda' }} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Tugas belum selesai">
          {open.length ? <div className="card rows overflow-hidden">{open.map((t) => <TaskRow key={t.id} {...taskRowProps(t, byId, today)} />)}</div>
            : <div className="card"><EmptyState>Semua tugas beres.</EmptyState></div>}
          {done.length > 0 && (
            <details className="mt-3">
              <summary className="flex min-h-11 cursor-pointer items-center px-1 text-[13px] font-semibold text-muted">{done.length} tugas selesai</summary>
              <div className="card rows overflow-hidden">{done.map((t) => <TaskRow key={t.id} {...taskRowProps(t, byId, today)} />)}</div>
            </details>
          )}
        </Section>
        <Section title="Mata kuliah">
          {shown.length ? (
            <div className="card rows overflow-hidden">
              {shown.map((c) => (
                <div key={c.id} className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0"><span className="block text-[14px] font-semibold">{c.name}{c.alias ? <span className="font-normal text-muted"> ({c.alias})</span> : null}</span><span className="block text-[12px] text-muted">{c.lecturer ?? 'Dosen belum diisi'}</span></span>
                  <span className="text-[12px] text-muted">{c.credits ?? '-'} SKS</span>
                </div>
              ))}
            </div>
          ) : <div className="card"><EmptyState>Belum ada mata kuliah.</EmptyState></div>}
        </Section>
      </div>
      <Section title="Jadwal mingguan">
        {schedules.length ? (
          <div className="flex flex-col gap-3">
            {WEEKDAYS_ID.map((day, i) => {
              const list = schedules.filter((x) => x.weekday === i + 1 && shown.some((c) => c.id === x.course_id));
              if (!list.length) return null;
              return (
                <div key={day}>
                  <p className="mb-1.5 px-1 text-[12px] font-semibold text-muted">{day}</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((x) => <ClassCard key={x.id} title={byId.get(x.course_id)?.name ?? 'Kelas'} start={x.start_time} end={x.end_time} place={x.location} />)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <div className="card"><EmptyState>Belum ada jadwal kelas.</EmptyState></div>}
      </Section>
    </div>
  );
}
