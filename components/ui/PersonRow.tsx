import { formatRp } from '@/lib/format';
import { Avatar } from './Avatar';

/** Piutang/utang: avatar inisial, nama, keterangan, nominal sisa. */
export function PersonRow({ name, detail, amount }: { name: string; detail: string; amount: number }) {
  return (
    <div className="flex min-h-[56px] items-center gap-3 px-4 py-2.5">
      <Avatar name={name} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{name}</span>
        <span className="block truncate text-[12px] text-muted">{detail}</span>
      </span>
      <span className="num text-[14px] font-bold">{formatRp(amount)}</span>
    </div>
  );
}
