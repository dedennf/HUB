import Link from 'next/link';
import type { Account } from '@/lib/types';
import { AccountLogo } from './AccountLogo';
import { Balance } from './Balance';
import { Trend } from './Trend';

export const ACCOUNT_TYPE_LABEL: Record<Account['type'], string> = { bank: 'Bank', ewallet: 'Dompet digital', cash: 'Tunai', investment: 'Investasi' };

/** Logo (atau inisial), nama, jenis, saldo, perubahan bulan ini. Investasi diberi keterangan "tidak siap pakai". */
export function AccountRow({ account, change, href }: { account: Account; change: number; href: string }) {
  return (
    <Link href={href} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5 hover:bg-bg">
      <AccountLogo name={account.name} type={account.type} domain={account.logo_domain} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{account.name}</span>
        <span className="block truncate text-[12px] text-muted">{ACCOUNT_TYPE_LABEL[account.type]}{account.type === 'investment' ? ' · tidak siap pakai' : ''}</span>
      </span>
      <span className="text-right">
        <Balance value={account.balance} className="block text-[14px] font-bold" />
        <span className="block text-[12px]"><Trend amount={change} /></span>
      </span>
    </Link>
  );
}
