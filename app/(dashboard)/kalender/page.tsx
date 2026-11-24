import type { Metadata } from 'next';
import Link from 'next/link';
import { ClassCard } from '@/components/ui/ClassCard';
import { MonthGrid } from '@/components/ui/MonthGrid';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { ProgressCard } from '@/components/ui/ProgressCard';
import { AddButton, EmptyState, PageHeader, Section } from '@/components/ui/Section';
import { TaskRow } from '@/components/ui/TaskRow';
import { WeekStrip } from '@/components/ui/WeekStrip';
import { buildCalendarItems, CALENDAR_TYPES, type CalendarItem } from '@/lib/calendar';
import { db, getCalendarSources, getResearchProjects } from '@/lib/data';
import { formatDayShort, formatMonthYear, formatTime } from '@/lib/format';
import { summarizeProject } from '@/lib/research';
import { taskRowProps } from '@/lib/task-view';
import { addDays, isIsoDate, isoWeekday, todayIso, zonedParts } from '@/lib/time';

export const metadata: Metadata = { title: 'Agenda' };

const DOT: Record<string, string> = {
  kelas: 'bg-cat-class', tugas: 'bg-cat-task', ujian: 'bg-cat-task', kerjakan: 'bg-cat-task', tagihan: 'bg-cat-bill',
  riset: 'bg-cat-study', bimbingan: 'bg-cat-study', libur: 'bg-cat-event', acara: 'bg-cat-event',
};

function AgendaLine({ i }: { i: CalendarItem }) {
  const inner = (
    <>
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[i.type]}`} aria-hidden="true" />
      <span className="flex-1">{i.title}{i.subtitle ? <span className="text-muted"> · {i.subtitle}</span> : null}</span>
      <span className="text-[12px] text-muted">{i.time ? `${formatTime(i.time)}${i.endTime ? `–${formatTime(i.endTime)}` : ''}` : CALENDAR_TYPES[i.type].label}</span>
    </>
  );
  const cls = `flex min-h-11 items-center gap-2.5 px-4 text-[13px] ${i.done ? 'text-muted line-through' : ''}`;
  const href = editHref(i);
  return href ? <Link href={href} className={`${cls} hover:bg-bg`}>{inner}</Link> : <p className={cls}>{inner}</p>;
}

function WeekColumns({ days, items, today }: { days: string[]; items: Map<string, CalendarItem[]>; today: string }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
      {days.map((d) => {
        const list = items.get(d) ?? [];
        return (
          <section key={d} aria-label={formatDayShort(d)} className={`card overflow-hidden ${d === today ? 'ring-1 ring-accent' : ''}`}>
            <h3 className={`px-4 pt-3 text-[12px] font-semibold ${d === today ? 'text-accent' : 'text-muted'}`}>{formatDayShort(d)}</h3>
            {list.length ? <div className="rows pb-1">{list.map((i, k) => <AgendaLine key={k} i={i} />)}</div>
              : <p className="px-4 pb-3 pt-1 text-[12px] text-muted">Kosong</p>}
          </section>
        );
      })}
    </div>
  );
}

/** Tautan ubah untuk item kalender sesuai tabel asalnya. */
function editHref(i: CalendarItem): string | undefined {
  const back = '?kembali=/kalender';
  switch (i.ref_table) {
    case 'events': return `/catat/acara/${i.ref_id}${back}`;
    case 'holidays': return `/catat/libur/${i.ref_id}${back}`;
    case 'tasks': return `/catat/tugas/${i.ref_id}${back}`;
    case 'course_schedules': return `/catat/jadwal/${i.ref_id}${back}`;
    case 'research_targets': return `/catat/target/${i.ref_id}${back}`;
    case 'supervisions': return `/catat/bimbingan/${i.ref_id}${back}`;
    case 'bills': return `/keuangan/tagihan/${i.ref_id}/bayar`;
    case 'sinking_funds': return `/catat/biaya-sejati/${i.ref_id}${back}`;
    default: return undefined;
  }
}

export default async function AgendaPage({ searchParams }: PageProps<'/kalender'>) {
  const sp = await searchParams;
  const today = todayIso();
  const selected = typeof sp.hari === 'string' && isIsoDate(sp.hari) ? sp.hari : today;
  const view = sp.tampilan === 'minggu' || sp.tampilan === 'bulan' ? sp.tampilan : 'agenda';
  const q = (d: string, v: string = view) => `/kalender?${new URLSearchParams({ ...(v !== 'agenda' ? { tampilan: v } : {}), ...(d !== today ? { hari: d } : {}) })}`;
  const shiftMonth = (n: number) => { const [y, m] = selected.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10); };
  const prev = view === 'bulan' ? shiftMonth(-1) : addDays(selected, -7);
  const next = view === 'bulan' ? shiftMonth(1) : addDays(selected, 7);
  const s = await db();
  const [sources, projects] = await Promise.all([getCalendarSources(s), getResearchProjects(s)]);
  const courses = new Map(sources.courses.map((c) => [c.id, c]));
  const active = sources.semesters.find((x) => x.is_active);

  const dayItems = buildCalendarItems(sources, selected, selected).get(selected) ?? [];
  const monthStart = `${selected.slice(0, 7)}-01`;
  const monthItems = view === 'bulan' ? buildCalendarItems(sources, addDays(monthStart, -7), addDays(monthStart, 42)) : null;
  const weekStart = addDays(selected, 1 - isoWeekday(selected));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekItems = view === 'minggu' ? buildCalendarItems(sources, weekDays[0], weekDays[6]) : null;
  const cards = dayItems.filter((i) => i.type === 'kelas' || i.type === 'acara' || i.type === 'libur');
  const otherDayItems = dayItems.filter((i) => !cards.includes(i));
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
          <AddButton href={`/catat/tugas?kembali=/kalender`} label="Tambah tugas" />
          <Link href={q(prev)} className="btn px-3" aria-label={view === 'bulan' ? 'Bulan sebelumnya' : 'Minggu sebelumnya'}>‹</Link>
          {selected !== today && <Link href={q(today)} className="btn px-3">Hari ini</Link>}
          <Link href={q(next)} className="btn px-3" aria-label={view === 'bulan' ? 'Bulan berikutnya' : 'Minggu berikutnya'}>›</Link>
        </span>
      } />
      <SegmentedTabs label="Tampilan kalender" current={view} items={[
        { key: 'agenda', label: 'Agenda', href: q(selected, 'agenda') },
        { key: 'minggu', label: 'Minggu', href: q(selected, 'minggu') },
        { key: 'bulan', label: 'Bulan', href: q(selected, 'bulan') },
      ]} />
      {view === 'bulan'
        ? <MonthGrid month={selected.slice(0, 7)} selected={selected} today={today} items={monthItems!} hrefFor={(d) => q(d)} />
        : <WeekStrip selected={selected} today={today} dueDays={dueDays} hrefFor={(d) => q(d)} />}
      {view === 'minggu' && <WeekColumns days={weekDays} items={weekItems!} today={today} />}

      {view !== 'minggu' && <Section title={selected === today ? 'Hari ini' : formatDayShort(selected)} add={{ href: `/catat/acara?date=${selected}&kembali=/kalender`, label: 'Tambah acara' }}>
        {cards.length ? (
          <div role="region" tabIndex={0} aria-label="Kelas dan acara, geser ke samping" className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:px-0">
            {cards.map((c, k) => (
              <ClassCard key={k} kind={c.type === 'kelas' ? 'class' : 'event'} title={c.type === 'libur' ? `Libur: ${c.title}` : c.title}
                start={c.time} end={c.endTime} place={c.subtitle} href={editHref(c)} />
            ))}
          </div>
        ) : <div className="card"><EmptyState>Tidak ada kelas atau acara{selected === today ? ' hari ini' : ''}.</EmptyState></div>}
        {view === 'bulan' && otherDayItems.length > 0 && (
          <div className="card rows mt-3 overflow-hidden">
            {otherDayItems.map((i, k) => <AgendaLine key={k} i={i} />)}
          </div>
        )}
      </Section>}

      <Section title="Tugas" href="/kuliah">
        {openTasks.length ? (
          <div className="card rows overflow-hidden">{openTasks.map((t) => <TaskRow key={t.id} {...taskRowProps(t, courses, today)} href={`/catat/tugas/${t.id}?kembali=/kalender`} />)}</div>
        ) : <div className="card"><EmptyState>Semua tugas beres.</EmptyState></div>}
      </Section>

      {research && (
        <ProgressCard title={research.project.title} percent={research.percent} href="/riset"
          detail={`${research.done} dari ${research.total} target`} />
      )}

      {view === 'agenda' && <Section title="14 hari ke depan">
        {upcomingDays.length ? (
          <div className="card rows overflow-hidden">
            {upcomingDays.map(([d, list]) => (
              <div key={d} className="px-4 py-2.5">
                <p className="text-[12px] font-semibold text-muted">{formatDayShort(d)}</p>
                {list.map((i, k) => {
                  const inner = (
                    <>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[i.type]}`} aria-hidden="true" />
                      <span className="flex-1">{i.title}{i.subtitle ? <span className="text-muted"> · {i.subtitle}</span> : null}</span>
                      <span className="text-[12px] text-muted">{i.time ? formatTime(i.time) : CALENDAR_TYPES[i.type].label}</span>
                    </>
                  );
                  const cls = `flex min-h-11 items-center gap-2.5 text-[13px] ${i.done ? 'text-muted line-through' : ''}`;
                  const href = editHref(i);
                  return href ? <Link key={k} href={href} className={`${cls} hover:text-accent`}>{inner}</Link> : <p key={k} className={cls}>{inner}</p>;
                })}
              </div>
            ))}
          </div>
        ) : <div className="card"><EmptyState>Tidak ada tenggat, tagihan, atau acara dalam 14 hari ke depan.</EmptyState></div>}
      </Section>}
    </div>
  );
}
