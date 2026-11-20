import Link from 'next/link';
import type { Metadata } from 'next';
import { Empty, PageTitle, Section } from '@/components/ui';
import { buildCalendarItems, CALENDAR_TYPES } from '@/lib/calendar';
import { db, getCalendarSources } from '@/lib/data';
import { addDays, formatDateId, isIsoDate, todayIso } from '@/lib/time';

export const metadata: Metadata = { title: 'Kalender' };
const SPAN = 14;

export default async function KalenderPage({ searchParams }: PageProps<'/kalender'>) {
  const sp = await searchParams;
  const today = todayIso();
  const from = typeof sp.mulai === 'string' && isIsoDate(sp.mulai) ? sp.mulai : today;
  const to = addDays(from, SPAN - 1);
  const items = buildCalendarItems(await getCalendarSources(await db()), from, to);
  const days = Array.from({ length: SPAN }, (_, i) => addDays(from, i));

  return (
    <>
      <PageTitle
        title="Kalender"
        kicker={`${formatDateId(from, { day: 'numeric', month: 'short' })} sampai ${formatDateId(to, { day: 'numeric', month: 'short', year: 'numeric' })}`}
        right={
          <div className="flex gap-2">
            <Link className="btn btn-sm" href={`/kalender?mulai=${addDays(from, -SPAN)}`}>‹</Link>
            <Link className="btn btn-sm" href="/kalender">Hari ini</Link>
            <Link className="btn btn-sm" href={`/kalender?mulai=${addDays(from, SPAN)}`}>›</Link>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.values(CALENDAR_TYPES).map((t) => (
          <span key={t.label} className="chip"><span className="h-2 w-2 rounded-full" style={{ background: t.color }} />{t.label}</span>
        ))}
      </div>
      <Section title="Agenda">
        {days.map((d) => {
          const list = items.get(d) ?? [];
          return (
            <div key={d} className={`border-t border-line py-2 first:border-t-0 ${d === today ? 'bg-accent/5' : ''}`}>
              <div className={`text-xs font-medium ${d === today ? 'text-accent' : 'text-muted'}`}>{formatDateId(d, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
              {list.length ? list.map((i, k) => (
                <div key={k} className={`flex items-center justify-between gap-2 py-1 text-sm ${i.done ? 'line-through opacity-60' : ''}`}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: i.color }} />
                    <span className="truncate">{i.title}{i.subtitle ? <span className="text-xs text-muted"> · {i.subtitle}</span> : null}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{i.time ? `${i.time}${i.endTime ? `–${i.endTime}` : ''}` : CALENDAR_TYPES[i.type].label}</span>
                </div>
              )) : <Empty>Kosong</Empty>}
            </div>
          );
        })}
      </Section>
      <p className="mt-2 text-xs text-muted">Tampilan bulan dan minggu seperti app lama hadir di Fase 1b.</p>
    </>
  );
}
