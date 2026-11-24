import type { Metadata } from 'next';
import Link from 'next/link';
import { ClassCard } from '@/components/ui/ClassCard';
import { AddButton, EmptyState, PageHeader, Section } from '@/components/ui/Section';
import { TaskRow } from '@/components/ui/TaskRow';
import { db, getCourses, getMaterials, getSchedules, getSemesters, getTasks } from '@/lib/data';
import { formatDayMonth } from '@/lib/format';
import { taskRowProps } from '@/lib/task-view';
import { todayIso, WEEKDAYS_ID } from '@/lib/time';

export const metadata: Metadata = { title: 'Kuliah' };
const K = '?kembali=/kuliah';

export default async function KuliahPage() {
  const s = await db();
  const [semesters, courses, schedules, tasks, materials] = await Promise.all([getSemesters(s), getCourses(s), getSchedules(s), getTasks(s), getMaterials(s)]);
  const today = todayIso();
  const active = semesters.find((x) => x.is_active);
  const shown = courses.filter((c) => !active || c.semester_id === active.id);
  const byId = new Map(courses.map((c) => [c.id, c]));
  const roots = tasks.filter((t) => !t.parent_id);
  const open = roots.filter((t) => t.status !== 'done').sort((a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'));
  const done = roots.filter((t) => t.status === 'done');
  const shownMaterials = materials.filter((m) => !m.course_id || shown.some((c) => c.id === m.course_id));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Kuliah" back={{ href: '/kalender', label: 'Agenda' }} right={<AddButton href={`/catat/tugas${K}`} label="Tambah tugas" />} />
      <div className="card flex min-h-[60px] flex-wrap items-center justify-between gap-2 p-4">
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold">{active ? active.name : 'Belum ada semester aktif'}</span>
          <span className="block text-[12px] text-muted">
            {active ? (active.start_date && active.end_date ? `${formatDayMonth(active.start_date)} sampai ${formatDayMonth(active.end_date)}` : 'Tanggal semester belum diatur, jadwal kelas tampil tanpa batas') : 'Atur semester supaya jadwal kelas tampil di Agenda'}
          </span>
        </span>
        <span className="flex gap-2">
          {active && <Link href={`/catat/semester/${active.id}${K}`} className="btn">Ubah semester</Link>}
          <Link href={`/catat/semester${K}`} className="btn">Semester baru</Link>
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Tugas belum selesai" add={{ href: `/catat/tugas${K}`, label: 'Tambah tugas' }}>
          {open.length ? <div className="card rows overflow-hidden">{open.map((t) => <TaskRow key={t.id} {...taskRowProps(t, byId, today)} href={`/catat/tugas/${t.id}${K}`} />)}</div>
            : <div className="card"><EmptyState>Semua tugas beres.</EmptyState></div>}
          {done.length > 0 && (
            <details className="mt-3">
              <summary className="flex min-h-11 cursor-pointer items-center px-1 text-[13px] font-semibold text-muted">{done.length} tugas selesai</summary>
              <div className="card rows overflow-hidden">{done.map((t) => <TaskRow key={t.id} {...taskRowProps(t, byId, today)} href={`/catat/tugas/${t.id}${K}`} />)}</div>
            </details>
          )}
        </Section>
        <Section title="Mata kuliah" add={{ href: `/catat/matkul${K}${active ? `&semester_id=${active.id}` : ''}`, label: 'Tambah mata kuliah' }}>
          {shown.length ? (
            <div className="card rows overflow-hidden">
              {shown.map((c) => (
                <Link key={c.id} href={`/catat/matkul/${c.id}${K}`} className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-2.5 hover:bg-bg">
                  <span className="min-w-0"><span className="block text-[14px] font-semibold">{c.name}{c.alias ? <span className="font-normal text-muted"> ({c.alias})</span> : null}</span><span className="block text-[12px] text-muted">{c.lecturer ?? 'Dosen belum diisi'}</span></span>
                  <span className="text-[12px] text-muted">{c.credits ?? '-'} SKS</span>
                </Link>
              ))}
            </div>
          ) : <div className="card"><EmptyState>Belum ada mata kuliah.</EmptyState></div>}
        </Section>
      </div>
      <Section title="Jadwal mingguan" add={{ href: `/catat/jadwal${K}`, label: 'Tambah jadwal kelas' }}>
        {schedules.length ? (
          <div className="flex flex-col gap-3">
            {WEEKDAYS_ID.map((day, i) => {
              const list = schedules.filter((x) => x.weekday === i + 1 && shown.some((c) => c.id === x.course_id));
              if (!list.length) return null;
              return (
                <div key={day}>
                  <p className="mb-1.5 px-1 text-[12px] font-semibold text-muted">{day}</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((x) => <ClassCard key={x.id} title={byId.get(x.course_id)?.name ?? 'Kelas'} start={x.start_time} end={x.end_time} place={x.location} href={`/catat/jadwal/${x.id}${K}`} />)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <div className="card"><EmptyState>Belum ada jadwal kelas.</EmptyState></div>}
      </Section>
      <Section title="Materi" add={{ href: `/catat/materi${K}`, label: 'Tambah materi' }}>
        {shownMaterials.length ? (
          <div className="card rows overflow-hidden">
            {shownMaterials.map((m) => (
              <div key={m.id} className="flex min-h-[56px] items-center gap-3 px-4 py-2">
                <Link href={`/catat/materi/${m.id}${K}`} className="min-w-0 flex-1 py-1 hover:text-accent">
                  <span className="block truncate text-[14px] font-semibold">{m.title}</span>
                  <span className="block truncate text-[12px] text-muted">{[byId.get(m.course_id ?? '')?.name, m.meeting ? `pertemuan ${m.meeting}` : '', m.kind].filter(Boolean).join(' · ') || 'Materi umum'}</span>
                </Link>
                {m.url && <a href={m.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-11 items-center justify-center text-[13px] font-semibold text-accent">Buka</a>}
              </div>
            ))}
          </div>
        ) : <div className="card"><EmptyState>Belum ada materi.</EmptyState></div>}
      </Section>
    </div>
  );
}
