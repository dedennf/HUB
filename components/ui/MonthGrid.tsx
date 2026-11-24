import Link from 'next/link';
import type { CalendarItem } from '@/lib/calendar';
import { addDays, isoWeekday } from '@/lib/time';

const HEAD = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const DOT: Record<string, string> = {
  kelas: 'bg-cat-class', tugas: 'bg-cat-task', ujian: 'bg-cat-task', kerjakan: 'bg-cat-task', tagihan: 'bg-cat-bill',
  riset: 'bg-cat-study', bimbingan: 'bg-cat-study', libur: 'bg-cat-event', acara: 'bg-cat-event',
};

/** Kisi bulan Senin sampai Minggu. Titik warna per jenis item, maksimal tiga. */
export function MonthGrid({ month, selected, today, items, hrefFor }: {
  month: string; selected: string; today: string; items: Map<string, CalendarItem[]>; hrefFor: (d: string) => string;
}) {
  const first = `${month}-01`;
  const start = addDays(first, 1 - isoWeekday(first));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const rows = cells[35].slice(0, 7) === month ? 6 : 5;
  return (
    <div role="grid" aria-label="Kalender bulan" className="card overflow-hidden p-2">
      <div role="row" className="grid grid-cols-7">
        {HEAD.map((h) => <span key={h} role="columnheader" className="py-1.5 text-center text-[11px] font-semibold text-muted">{h}</span>)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} role="row" className="grid grid-cols-7 gap-1">
          {cells.slice(r * 7, r * 7 + 7).map((d) => {
            const list = items.get(d) ?? [];
            const inMonth = d.slice(0, 7) === month;
            const active = d === selected;
            const types = [...new Set(list.map((i) => i.type))];
            return (
              <Link key={d} role="gridcell" href={hrefFor(d)} aria-current={active ? 'date' : undefined}
                aria-label={`${Number(d.slice(8))}${d === today ? ', hari ini' : ''}${list.length ? `, ${list.length} item` : ''}`}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[14px] ${active ? 'bg-accent-fill text-on-accent' : d === today ? 'font-bold text-accent ring-1 ring-accent' : inMonth ? 'text-fg hover:bg-bg' : 'text-muted hover:bg-bg'}`}>
                <span className="num">{Number(d.slice(8))}</span>
                <span className="flex h-1.5 gap-0.5" aria-hidden="true">
                  {types.slice(0, 3).map((t) => <span key={t} className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-on-accent' : DOT[t]}`} />)}
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export { DOT as CALENDAR_DOT };
