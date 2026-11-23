import { ChevronRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

/** Ikon di kotak --accent-soft, judul, keterangan, panah. */
export function MenuRow({ href, icon: Icon, title, detail }: { href: string; icon: LucideIcon; title: string; detail: string }) {
  return (
    <Link href={href} className="flex min-h-[68px] items-center gap-3.5 px-4 py-3 hover:bg-bg">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">{title}</span>
        <span className="block truncate text-[12px] text-muted">{detail}</span>
      </span>
      <ChevronRight size={18} strokeWidth={1.8} className="text-muted" aria-hidden="true" />
    </Link>
  );
}
