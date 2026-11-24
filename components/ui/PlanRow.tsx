import Link from 'next/link';
import { formatPercent } from '@/lib/format';
import { Chip } from './Chip';

/**
 * Baris rencana: nama, keterangan, chip persen, bar 8 px.
 * Budget: bar oranye bila ≥ 75%. Target: bar accent dan chip info.
 */
export function PlanRow({ title, detail, ratio, kind, href }: { title: string; detail: string; ratio: number; kind: 'budget' | 'goal'; href?: string }) {
  const warn = kind === 'budget' && ratio >= 0.75;
  const over = kind === 'budget' && ratio > 1;
  const pct = Math.max(0, Math.min(1, ratio));
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">{title}</p>
          <p className="text-[12px] text-muted">{detail}</p>
        </div>
        <Chip tone={over ? 'danger' : warn ? 'warn' : kind === 'goal' ? 'info' : 'neutral'}>{formatPercent(ratio, 0)}</Chip>
      </div>
      <div className="mt-2 h-2 rounded-full bg-track" role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${title} ${formatPercent(ratio, 0)}`}>
        <div className={`h-2 rounded-full ${warn ? 'bg-cat-task' : 'bg-accent'}`} style={{ width: `${pct * 100}%` }} />
      </div>
    </>
  );
  return href ? <Link href={href} className="block px-4 py-3 hover:bg-bg">{body}</Link> : <div className="px-4 py-3">{body}</div>;
}

/** Alias sesuai nama di DESIGN 6. */
export const BudgetBar = (p: { title: string; detail: string; ratio: number }) => <PlanRow {...p} kind="budget" />;
