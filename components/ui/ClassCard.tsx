import { formatTime } from '@/lib/format';

/** Kartu kelas: garis atas biru 4 px, jam, nama, ruang. Dipakai juga untuk acara (garis abu). */
export function ClassCard({ start, end, title, place, kind = 'class' }: { start?: string; end?: string; title: string; place?: string | null; kind?: 'class' | 'event' }) {
  return (
    <article className={`card min-w-[160px] overflow-hidden border-t-4 p-3 ${kind === 'class' ? 'border-t-cat-class' : 'border-t-cat-event'}`}>
      <p className="num text-[12px] text-muted">{start ? `${formatTime(start)}${end ? ` – ${formatTime(end)}` : ''}` : 'Sepanjang hari'}</p>
      <p className="mt-0.5 text-[14px] font-semibold leading-snug">{title}</p>
      {place && <p className="mt-0.5 text-[12px] text-muted">{place}</p>}
    </article>
  );
}
