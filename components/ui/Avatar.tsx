import { initials } from '@/lib/format';

export type AvatarTone = 'bank' | 'ewallet' | 'cash' | 'invest' | 'neutral';
const TONE: Record<AvatarTone, string> = {
  bank: 'bg-[var(--av-bank-bg)] text-[var(--av-bank-fg)]',
  ewallet: 'bg-[var(--av-ewallet-bg)] text-[var(--av-ewallet-fg)]',
  cash: 'bg-[var(--av-cash-bg)] text-[var(--av-cash-fg)]',
  invest: 'bg-[var(--av-invest-bg)] text-[var(--av-invest-fg)]',
  neutral: 'bg-track text-fg',
};

/** Lingkaran inisial dua huruf. */
export function Avatar({ name, tone = 'neutral', size = 40 }: { name: string; tone?: AvatarTone; size?: number }) {
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${TONE[tone]}`} style={{ width: size, height: size }}>
      {initials(name)}
    </span>
  );
}
