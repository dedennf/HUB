'use client';
import { useState } from 'react';
import { usePrivacy } from '@/components/providers/PrivacyProvider';
import type { RangeKey } from '@/lib/finance';
import { RangeTabs } from './RangeTabs';
import { Sparkline } from './Sparkline';

const OPTIONS: { key: RangeKey; label: string; name: string }[] = [
  { key: '1B', label: '1B', name: '1 bulan' }, { key: '3B', label: '3B', name: '3 bulan' },
  { key: '6B', label: '6B', name: '6 bulan' }, { key: '1T', label: '1T', name: '1 tahun' },
];

/** Sparkline uang siap pakai + pilihan rentang. Rentang tanpa data tidak menggambar garis (D-27). */
export function MoneyChart({ series, className = '' }: { series: Record<RangeKey, number[] | null>; className?: string }) {
  const [range, setRange] = useState<RangeKey>('1B');
  const { hidden } = usePrivacy();
  const values = series[range];
  const name = OPTIONS.find((o) => o.key === range)!.name;
  return (
    <div className={className}>
      <div className="flex h-[70px] items-center">
        {hidden ? <p className="w-full text-center text-[12px] text-muted">Grafik disembunyikan</p>
          : values ? <Sparkline values={values} label={`Grafik uang siap pakai ${name} terakhir`} />
            : <p className="w-full text-center text-[12px] text-muted">Belum ada transaksi dalam {name} terakhir.</p>}
      </div>
      <div className="mt-2"><RangeTabs options={OPTIONS} value={range} onChange={setRange} /></div>
    </div>
  );
}
