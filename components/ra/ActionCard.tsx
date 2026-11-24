import { Pencil, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type ActionChip = { label: string; doubtful?: boolean; onEditLabel?: string; onEdit?: () => void; active?: boolean };

/**
 * Kartu usulan aksi Ra: ikon jenis, label jenis, nilai utama, chip yang bisa diketuk untuk diubah.
 * Field meragukan = chip warn + kalimat penjelasan (DESIGN 6, Agen.dc.html). Aksi destruktif berbingkai merah.
 */
export function ActionCard({
  icon: Icon, tone = 'neutral', kindLabel, value, chips, note, noteWarn = true, editable = false, destructive = false, onRemove, children,
}: {
  icon: LucideIcon; tone?: 'expense' | 'income' | 'task' | 'neutral' | 'danger'; kindLabel: string; value: string; chips: ActionChip[];
  note?: string; noteWarn?: boolean; editable?: boolean; destructive?: boolean; onRemove?: () => void; children?: ReactNode;
}) {
  const t = destructive ? 'danger' : tone;
  const toneCls = { expense: 'bg-danger-bg text-danger-fg', income: 'bg-ok-bg text-ok-fg', task: 'bg-warn-bg text-warn-fg', neutral: 'bg-accent-soft text-accent', danger: 'bg-danger-bg text-danger-fg' }[t];
  return (
    <article className={`card p-4 ${destructive ? 'border-danger-fg/50' : ''}`}>
      <div className="flex items-center gap-3">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${toneCls}`}>
          <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-[12px] ${destructive ? 'font-semibold text-danger-fg' : 'text-muted'}`}>{kindLabel}</p>
          <p className="num truncate font-display text-[17px] font-extrabold">{value}</p>
        </div>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={`Lewati ${kindLabel.toLowerCase()} ${value}`} className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-fg">
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}
      </div>
      {chips.length > 0 && (
        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(90px,1fr))] gap-2">
          {chips.map((c, i) => {
            const cls = `flex min-h-11 items-center justify-center gap-1 rounded-xl border px-2 text-center text-[12px] font-medium ${c.doubtful ? 'border-warn-fg/40 bg-warn-bg text-warn-fg' : 'border-line bg-bg text-fg'} ${c.active ? 'ring-2 ring-accent' : ''}`;
            return (editable || c.onEdit)
              ? (
                <button key={`${i}-${c.label}`} type="button" onClick={c.onEdit} aria-expanded={c.onEdit ? !!c.active : undefined}
                  aria-label={`Ubah ${c.onEditLabel ?? c.label}${c.doubtful ? ', perlu dicek' : ''}`} className={`${cls} hover:border-accent`}>
                  {c.label}{c.doubtful ? ' ?' : ''}{c.onEdit && <Pencil size={11} strokeWidth={2} className="shrink-0 opacity-60" aria-hidden="true" />}
                </button>
              )
              : <span key={`${i}-${c.label}`} className={cls}>{c.label}{c.doubtful ? <span aria-label=", perlu dicek"> ?</span> : ''}</span>;
          })}
        </div>
      )}
      {children}
      {note && (
        <p className={`mt-2 flex gap-1.5 text-[12px] ${destructive ? 'text-danger-fg' : noteWarn ? 'text-warn-fg' : 'text-muted'}`}>
          {destructive && <TriangleAlert size={14} strokeWidth={2} className="mt-px shrink-0" aria-hidden="true" />}
          {note}
        </p>
      )}
    </article>
  );
}
