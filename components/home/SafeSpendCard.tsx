import Link from 'next/link';
import { Balance } from '@/components/ui/Balance';
import type { SafeToSpend } from '@/lib/finance';

/** D-62: batas aman belanja hari ini dari sisa budget bulanan. */
export function SafeSpendCard({ s }: { s: SafeToSpend | null }) {
  if (!s) {
    return (
      <section aria-label="Aman dibelanjakan hari ini" className="card flex flex-col gap-1 p-4">
        <h2 className="h-section">Aman dibelanjakan hari ini</h2>
        <p className="text-[13px] text-muted">Isi budget bulanan di kategori, Kompas akan menghitung batas belanja harianmu.</p>
        <Link href="/pengaturan/kategori" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent-strong">Atur budget</Link>
      </section>
    );
  }
  const over = s.leftToday < 0;
  const used = s.perDay > 0 ? Math.min(1, s.spentToday / s.perDay) : 1;
  return (
    <section aria-label="Aman dibelanjakan hari ini" className="card flex flex-col gap-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="h-section">Aman dibelanjakan hari ini</h2>
        <Link href="/keuangan?tab=rencana" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent-strong">Budget</Link>
      </div>
      <p className={`font-display text-[28px] font-extrabold leading-none ${over ? 'text-negative' : ''}`}>
        {over ? <>Lewat <Balance value={-s.leftToday} /></> : <Balance value={s.leftToday} />}
      </p>
      <div className="h-2 rounded-full bg-line" aria-hidden="true">
        <div className={`h-2 rounded-full ${over ? 'bg-negative' : used > 0.8 ? 'bg-warn-fg' : 'bg-accent'}`} style={{ width: `${used * 100}%` }} />
      </div>
      <p className="text-[12px] text-muted">
        Jatah hari ini <Balance value={s.perDay} />, sudah terpakai <Balance value={s.spentToday} />. Sisa budget bulan ini <Balance value={Math.max(0, s.remaining)} />.
      </p>
    </section>
  );
}
