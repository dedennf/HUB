import Link from 'next/link';

export type BriefingItem = { key: string; color: 'class' | 'task' | 'bill' | 'study' | 'event'; text: string; action?: { label: string; href: string } };
const DOT = { class: 'bg-cat-class', task: 'bg-cat-task', bill: 'bg-cat-bill', study: 'bg-cat-study', event: 'bg-cat-event' } as const;

/**
 * Ringkasan hari ini dari data (D-27). Judul "Briefing pagi · Ra" baru dipakai setelah briefing Ra ada (Fase 6).
 */
export function BriefingCard({ title, time, items }: { title: string; time?: string; items: BriefingItem[] }) {
  return (
    <section className="card p-4" aria-label={title}>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="h-section">{title}</h2>
        {time && <span className="text-[12px] text-muted">{time}</span>}
      </div>
      {items.length === 0 ? <p className="py-2 text-[13px] text-muted">Tidak ada agenda, tenggat, atau tagihan hari ini.</p> : (
        <ul>
          {items.map((i) => (
            <li key={i.key} className="flex min-h-11 items-center gap-2.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[i.color]}`} aria-hidden="true" />
              <span className="flex-1 text-[13px] leading-snug">{i.text}</span>
              {i.action && (
                <Link href={i.action.href} className="inline-flex min-h-11 items-center"><span className="rounded-[10px] border border-line px-2.5 py-1.5 text-[12px] font-semibold text-accent">{i.action.label}</span></Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
