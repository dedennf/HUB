import { formatPercent, formatRpShort } from '@/lib/format';

/** Naik/turun selalu dengan tanda ▲/▼ selain warna (DESIGN 2.1 aksesibilitas). */
export function Trend({ ratio, amount, suffix = '', className = '' }: { ratio?: number; amount?: number; suffix?: string; className?: string }) {
  const v = ratio ?? amount ?? 0;
  if (v === 0) return <span className={`text-muted ${className}`}>tetap</span>;
  const up = v > 0;
  const text = ratio != null ? formatPercent(ratio) : formatRpShort(Math.abs(amount!));
  return (
    <span className={`num inline-flex items-center gap-1 font-semibold ${up ? 'text-positive' : 'text-negative'} ${className}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      <span className="sr-only">{up ? 'naik' : 'turun'}</span>
      {text}{suffix}
    </span>
  );
}
