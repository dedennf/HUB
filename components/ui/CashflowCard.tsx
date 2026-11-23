import { formatRp } from '@/lib/format';

/** Cashflow bulan ini + kotak Masuk ▲ dan Keluar ▼. Nominal transaksi tidak disembunyikan mode privasi. */
export function CashflowCard({ monthLabel, income, expense, daysLeft }: { monthLabel: string; income: number; expense: number; daysLeft: number }) {
  const net = income - expense;
  return (
    <section className="card p-4" aria-label={`Cashflow ${monthLabel}`}>
      <p className="text-[13px] text-muted">Cashflow {monthLabel}</p>
      <div className="flex items-baseline justify-between gap-2">
        <p className="num font-display text-[24px] font-extrabold lg:text-[26px]">{formatRp(net, { sign: true })}</p>
        <p className="text-[12px] text-muted">sisa {daysLeft} hari</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl bg-bg p-3">
          <p className="text-[12px] text-muted"><span aria-hidden="true">▲ </span>Masuk</p>
          <p className="num font-display text-[16px] font-bold text-positive">{formatRp(income)}</p>
        </div>
        <div className="rounded-xl bg-bg p-3">
          <p className="text-[12px] text-muted"><span aria-hidden="true">▼ </span>Keluar</p>
          <p className="num font-display text-[16px] font-bold text-negative">{formatRp(expense)}</p>
        </div>
      </div>
    </section>
  );
}
