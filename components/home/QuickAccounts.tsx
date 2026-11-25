import Link from 'next/link';
import { AccountLogo } from '@/components/ui/AccountLogo';
import { CopyButton } from '@/components/ui/CopyButton';
import { groupNumber, shareText } from '@/lib/brands';
import type { Account } from '@/lib/types';

/** D-61: nomor rekening dan e-wallet siap disalin saat ada yang minta. */
export function QuickAccounts({ accounts, compact = false }: { accounts: Account[]; compact?: boolean }) {
  const list = accounts.filter((a) => a.account_number && !a.is_archived && a.type !== 'investment');
  return (
    <section aria-label="Nomor rekening" className="card flex flex-col p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="h-section">Nomor rekening</h2>
        <Link href="/keuangan" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent-strong">{list.length ? 'Ubah' : 'Tambah'}</Link>
      </div>
      {list.length ? (
        <ul className="rows">
          {(compact ? list.slice(0, 4) : list).map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <AccountLogo name={a.name} type={a.type} domain={a.logo_domain} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{a.name}</span>
                <span className="num block whitespace-nowrap text-[14px] tracking-wide">{groupNumber(a.account_number!)}</span>
                {a.account_holder && <span className="block truncate text-[12px] text-muted">a.n. {a.account_holder}</span>}
              </span>
              <CopyButton text={shareText(a)} label="Salin" className="shrink-0" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">Simpan nomor rekening dan e-wallet di tiap akun (Uang, buka akun, Ubah akun). Nanti cukup ketuk Salin saat ada yang minta.</p>
      )}
    </section>
  );
}
