import Link from 'next/link';
import { addDays, isoWeekday } from '@/lib/time';

const SHORT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

/** 7 hari Senin sampai Minggu. Hari terpilih berlatar accent, titik oranye di hari bertenggat. */
export function WeekStrip({ selected, today, dueDays, hrefFor }: { selected: string; today: string; dueDays: Set<string>; hrefFor: (d: string) => string }) {
  const monday = addDays(selected, 1 - isoWeekday(selected));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return (
    <nav aria-label="Pilih hari" className="grid grid-cols-7 gap-1.5">
      {days.map((d, i) => {
        const active = d === selected;
        return (
          <Link key={d} href={hrefFor(d)} aria-current={active ? 'date' : undefined}
            aria-label={`${SHORT[i]} ${Number(d.slice(8))}${d === today ? ', hari ini' : ''}${dueDays.has(d) ? ', ada tenggat' : ''}`}
            className={`flex min-h-[60px] flex-col items-center justify-center gap-0.5 rounded-[14px] ${active ? 'bg-accent-fill text-on-accent' : 'bg-surface text-fg shadow-card'} ${d === today && !active ? 'ring-1 ring-accent' : ''}`}>
            <span className={`text-[11px] ${active ? '' : 'text-muted'}`}>{SHORT[i]}</span>
            <span className="font-display text-[16px] font-bold">{Number(d.slice(8))}</span>
            <span className={`h-1.5 w-1.5 rounded-full ${dueDays.has(d) ? (active ? 'bg-on-accent' : 'bg-cat-task') : 'bg-transparent'}`} aria-hidden="true" />
          </Link>
        );
      })}
    </nav>
  );
}
