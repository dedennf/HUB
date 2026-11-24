import Link from 'next/link';
import { formatRp } from '@/lib/format';
import { Avatar } from './Avatar';

/** Piutang/utang: avatar inisial, nama, keterangan, nominal sisa, tombol aksi opsional. */
export function PersonRow({ name, detail, amount, href, action }: { name: string; detail: string; amount: number; href?: string; action?: { href: string; label: string } }) {
  const body = (
    <>
      <Avatar name={name} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{name}</span>
        <span className="block truncate text-[12px] text-muted">{detail}</span>
      </span>
      <span className="num text-[14px] font-bold">{formatRp(amount)}</span>
    </>
  );
  return (
    <div className="flex min-h-[56px] items-center gap-2 pr-2">
      {href ? <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 hover:text-accent">{body}</Link>
        : <div className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4">{body}</div>}
      {action && <Link href={action.href} className="inline-flex min-h-11 items-center rounded-[10px] px-2 text-[12px] font-semibold text-accent">{action.label}</Link>}
    </div>
  );
}
