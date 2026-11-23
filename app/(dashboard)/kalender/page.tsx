import type { Metadata } from 'next';
import Link from 'next/link';
import { ClassCard } from '@/components/ui/ClassCard';
import { ProgressCard } from '@/components/ui/ProgressCard';
import { EmptyState, PageHeader, Section } from '@/components/ui/Section';
import { TaskRow } from '@/components/ui/TaskRow';
import { WeekStrip } from '@/components/ui/WeekStrip';
import { buildCalendarItems, CALENDAR_TYPES, type CalendarItem } from '@/lib/calendar';
import { db, getCalendarSources, getResearchProjects } from '@/lib/data';
import { formatDayShort, formatMonthYear, formatTime } from '@/lib/format';
import { summarizeProject } from '@/lib/research';
import { taskRowProps } from '@/lib/task-view';
import { addDays, isIsoDate, todayIso, zonedParts } from '@/lib/time';

export const metadata: Metadata = { title: 'Agenda' };

const DOT: Record<string, string> = {
  kelas: 'bg-cat-class', tugas: 'bg-cat-task', ujian: 'bg-cat-task', kerjakan: 'bg-cat-task', tagihan: 'bg-cat-bill',
  riset: 'bg-cat-study', bimbingan: 'bg-cat-study', libur: 'bg-cat-event', acara: 'bg-cat-event',
};

export default async function AgendaPage({ searchParams }: PageProps<'/kalender'>) {
  const sp = await searchParams;
  const today = todayIso();
  const selected = typeof sp.hari === 'string' && isIsoDate(sp.hari) ? sp.hari : today;
  const s = await db();
  const [sources, projects] = await Promise.all([getCalendarSources(s), getResearchProjects(s)]);
  const courses = new Map(sources.courses.map((c) => [c.id, c]));
  const active = sources.semesters.find((x) => x.is_active);

  const dayItems = buildCalendarItems(sources, selected, selected).get(selected) ?? [];
  const cards = dayItems.filter((i) => i.type === 'kelas' || i.type === 'acara' || i.type === 'libur');
  const openTasks = sources.tasks
    .filter((t) => t.status !== 'done' && !t.parent_id)
    .sort((a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'))
    .slice(0, 6);
  const dueDays = new Set(sources.tasks.filter((t) => t.status !== 'done' && t.due_at).map((t) => zonedParts(t.due_at!).date));
  const research = summarizeProject(projects, sources.targets, sources.supervisions, today);

  const from = addDays(selected, 1);
  const upcoming = buildCalendarItems(sources, from, addDays(from, 13));
  const upcomingDays = [...upcoming.entries()]
    .map(([d, list]) => [d, list.filter((i) => i.type !== 'kelas')] as [string, CalendarItem[]])
    .filter(([, list]) => list.length);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Agenda" kicker={`${formatMonthYear(selected)}${active ? ` · ${active.name}` : ''}`} right={
        <span className="flex gap-1">
          <Link href={`/kalender?hari=${addDays(selected, -7)}`} className="btn px-3" aria-label="Minggu sebelumnya">‹</Link>
          {selected !== today && <Link href="/kalender" className="btn px-3">Hari ini</Link>}
          <Link href={`/kalender?hari=${addDays(selected, 7)}`} className="btn px-3" aria-label="Minggu berikutnya">›</Link>
        </span>
      } />
      <WeekStrip selected={selected} today={today} dueDays={dueDays} hrefFor={(d) => (d === today ? '/kalender' : `/kalender?hari=${d}`)} />

      <Section title={selected === today ? 'Hari ini' : formatDayShort(selected)}>
        {cards.length ? (
          <div role="region" tabIndex={0} aria-label="Kelas dan acara, geser ke samping" className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:px-0">
            {cards.map((c, k) => (
              <ClassCard key={k} kind={c.type === 'kelas' ? 'class' : 'event'} title={c.type === 'libur' ? `Libur: ${c.title}` : c.title}
                start={c.time} end={c.endTime} place={c.subtitle} />
            ))}
          </div>
        ) : <div className="card"><EmptyState>Tidak ada kelas atau acara{selected === today ? ' hari ini' : ''}.</EmptyState></div>}
      </Section>

      <Section title="Tugas" href="/kuliah">
        {openTasks.length ? (
          <div className="card rows overflow-hidden">{openTasks.map((t) => <TaskRow key={t.id} {...taskRowProps(t, courses, today)} />)}</div>
        ) : <div className="card"><EmptyState>Semua tugas beres.</EmptyState></div>}
      </Section>

      {research && (
        <ProgressCard title={research.project.title} percent={research.percent} href="/riset"
          detail={`${research.done} dari ${research.total} target`} />
      )}

      <Section title="14 hari ke depan">
        {upcomingDays.length ? (
          <div className="card rows overflow-hidden">
            {upcomingDays.map(([d, list]) => (
              <div key={d} className="px-4 py-2.5">
                <p className="text-[12px] font-semibold text-muted">{formatDayShort(d)}</p>
                {list.map((i, k) => (
                  <p key={k} className={`flex min-h-9 items-center gap-2.5 text-[13px] ${i.done ? 'text-muted line-through' : ''}`}>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[i.type]}`} aria-hidden="true" />
                    <span className="flex-1">{i.title}{i.subtitle ? <span className="text-muted"> · {i.subtitle}</span> : null}</span>
                    <span className="text-[12px] text-muted">{i.time ? formatTime(i.time) : CALENDAR_TYPES[i.type].label}</span>
                  </p>
                ))}
              </div>
            ))}
          </div>
        ) : <div className="card"><EmptyState>Tidak ada tenggat, tagihan, atau acara dalam 14 hari ke depan.</EmptyState></div>}
      </Section>
    </div>
  );
}
