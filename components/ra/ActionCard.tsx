import type { LucideIcon } from 'lucide-react';

export type ActionChip = { label: string; doubtful?: boolean; onEditLabel?: string };

/**
 * Kartu usulan aksi Ra: ikon jenis, label jenis, nilai utama, chip yang bisa diketuk untuk diubah.
 * Field meragukan = chip warn + kalimat penjelasan (DESIGN 6, Agen.dc.html).
 */
export function ActionCard({
  icon: Icon, tone = 'neutral', kindLabel, value, chips, note,
}: { icon: LucideIcon; tone?: 'expense' | 'income' | 'task' | 'neutral'; kindLabel: string; value: string; chips: ActionChip[]; note?: string }) {
  const toneCls = { expense: 'bg-danger-bg text-danger-fg', income: 'bg-ok-bg text-ok-fg', task: 'bg-warn-bg text-warn-fg', neutral: 'bg-accent-soft text-accent' }[tone];
  return (
    <article className="card p-4">
      <div className="flex items-center gap-3">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${toneCls}`}>
          <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] text-muted">{kindLabel}</p>
          <p className="num font-display text-[17px] font-extrabold">{value}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(90px,1fr))] gap-2">
        {chips.map((c) => (
          <button key={c.label} type="button" aria-label={`Ubah ${c.onEditLabel ?? c.label}`}
            className={`min-h-11 rounded-xl border px-2 text-[12px] font-medium ${c.doubtful ? 'border-warn-fg/40 bg-warn-bg text-warn-fg' : 'border-line bg-bg text-fg'}`}>
            {c.label}{c.doubtful ? ' ?' : ''}
          </button>
        ))}
      </div>
      {note && <p className="mt-2 text-[12px] text-warn-fg">{note}</p>}
    </article>
  );
}
