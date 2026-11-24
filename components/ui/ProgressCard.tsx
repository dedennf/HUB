import Link from 'next/link';

/** Judul proyek riset + persen besar accent + bar. */
export function ProgressCard({ title, detail, percent, href, children }: { title: string; detail?: string; percent: number; href?: string; children?: React.ReactNode }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-bold">{title}</p>
          {detail && <p className="text-[12px] text-muted">{detail}</p>}
        </div>
        <p className="num font-display text-[24px] font-extrabold text-accent">{percent}%</p>
      </div>
      <div className="mt-2 h-2 rounded-full bg-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`Progres ${title}`}>
        <div className="h-2 rounded-full bg-accent" style={{ width: `${percent}%` }} />
      </div>
      {children}
    </>
  );
  return href ? <Link href={href} className="card block p-4 hover:ring-1 hover:ring-accent">{body}</Link> : <section className="card p-4">{body}</section>;
}
