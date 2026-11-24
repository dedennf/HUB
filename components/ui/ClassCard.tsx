import Link from 'next/link';
import { formatTime } from '@/lib/format';

/** Kartu kelas: garis atas biru 4 px, jam, nama, ruang. Dipakai juga untuk acara (garis abu). */
export function ClassCard({ start, end, title, place, kind = 'class', href }: { start?: string; end?: string; title: string; place?: string | null; kind?: 'class' | 'event'; href?: string }) {
  const body = (
    <>
      <p className="num text-[12px] text-muted">{start ? `${formatTime(start)}${end ? ` – ${formatTime(end)}` : ''}` : 'Sepanjang hari'}</p>
      <p className="mt-0.5 text-[14px] font-semibold leading-snug">{title}</p>
      {place && <p className="mt-0.5 text-[12px] text-muted">{place}</p>}
    </>
  );
  const cls = `card block min-w-[160px] overflow-hidden border-t-4 p-3 ${kind === 'class' ? 'border-t-cat-class' : 'border-t-cat-event'}`;
  return href ? <Link href={href} className={`${cls} hover:ring-1 hover:ring-accent`}>{body}</Link> : <article className={cls}>{body}</article>;
}
