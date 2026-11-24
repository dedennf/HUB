import { Balance } from './Balance';
import { PrivacyToggle } from './PrivacyToggle';
import { Trend } from './Trend';

/** "Uang siap pakai" + ikon mata, angka hero, kekayaan bersih + perubahan bulan ini. */
export function MoneyHero({ ready, netWorth, change }: { ready: number; netWorth: number; change: number | null }) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[13px] text-muted">Uang siap pakai <PrivacyToggle /></p>
      <p className="font-display text-[34px] font-extrabold leading-tight tracking-[-0.5px] lg:text-[40px]"><Balance value={ready} /></p>
      <p className="mt-0.5 text-[13px] text-muted">
        Kekayaan bersih <Balance value={netWorth} className="font-semibold text-fg" />
        {change != null && <> · <Trend ratio={change} suffix=" bulan ini" /></>}
      </p>
    </div>
  );
}
