import Link from 'next/link';
import { RaAvatar } from '@/components/ra/RaMark';

/** "N usulan Ra menunggu" + Tinjau. Tidak ditampilkan bila tidak ada usulan. */
export function ProposalBanner({ count, detail, href }: { count: number; detail?: string; href: string }) {
  if (count <= 0) return null;
  return (
    <div className="card flex items-center gap-3 px-4 py-3">
      <RaAvatar size={36} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">{count} usulan Ra menunggu</p>
        {detail && <p className="truncate text-[12px] text-muted">{detail}</p>}
      </div>
      <Link href={href} className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent">Tinjau</Link>
    </div>
  );
}
