'use client';
import { ArrowLeftRight, Mic, Plus, ReceiptText, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useRa } from '@/components/providers/RaProvider';

const item = 'flex min-h-11 flex-col items-center gap-1.5 text-[12px] text-fg';
const box = 'inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface text-accent';

function Icon({ icon: I }: { icon: LucideIcon }) {
  return <span className={box}><I size={22} strokeWidth={1.8} aria-hidden="true" /></span>;
}

/** Catat, Struk, Suara, Transfer. Struk dan Suara membuka Ra (belum aktif sampai Fase 4 dan 5). */
export function QuickActions() {
  const { openRa } = useRa();
  return (
    <nav aria-label="Aksi cepat" className="grid grid-cols-4 gap-2">
      <Link href="/keuangan?tab=transaksi#catat" className={item}><Icon icon={Plus} />Catat</Link>
      <button type="button" onClick={openRa} className={item}><Icon icon={ReceiptText} />Struk</button>
      <button type="button" onClick={openRa} className={item}><Icon icon={Mic} />Suara</button>
      <Link href="/keuangan?tab=transaksi&jenis=transfer#catat" className={item}><Icon icon={ArrowLeftRight} />Transfer</Link>
    </nav>
  );
}
