/** Garis accent tanpa grid. Nilai dinormalisasi ke kotak 350 × 70. */
export function Sparkline({ values, label, className = '' }: { values: number[]; label: string; className?: string }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // Rentang minimum 10% dari nilai terbesar, supaya perubahan kecil tidak tampak seperti jatuh bebas.
  const span = Math.max(hi - lo, Math.abs(hi) * 0.1, 1);
  const min = (hi + lo) / 2 - span / 2;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 350).toFixed(1)},${(62 - ((v - min) / span) * 54).toFixed(1)}`);
  return (
    <svg role="img" aria-label={label} viewBox="0 0 350 70" preserveAspectRatio="none" className={`h-[70px] w-full ${className}`}>
      <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
