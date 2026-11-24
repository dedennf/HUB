import type { Metadata } from 'next';
import { AccountRow } from '@/components/ui/AccountRow';
import { EmptyState, PageHeader } from '@/components/ui/Section';
import { db, getAccounts } from '@/lib/data';

export const metadata: Metadata = { title: 'Cocokkan saldo' };

export default async function CocokkanPage() {
  const accounts = (await getAccounts(await db())).filter((a) => !a.is_archived);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Cocokkan saldo" back={{ href: '/keuangan', label: 'Uang' }} />
      <p className="text-[13px] text-muted">Pilih akun, lalu isi saldo yang tertera di aplikasi aslinya. Selisihnya dicatat sebagai transaksi penyesuaian.</p>
      {accounts.length ? <div className="card rows overflow-hidden">{accounts.map((a) => <AccountRow key={a.id} account={a} change={0} href={`/keuangan/akun/${a.id}#cocokkan`} />)}</div>
        : <div className="card"><EmptyState>Belum ada akun.</EmptyState></div>}
    </div>
  );
}
