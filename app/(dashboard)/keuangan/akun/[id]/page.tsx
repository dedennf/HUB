import { notFound } from 'next/navigation';
import { ACCOUNT_TYPE_LABEL } from '@/components/ui/AccountRow';
import { Balance } from '@/components/ui/Balance';
import { PageHeader } from '@/components/ui/Section';
import { db, getAccounts } from '@/lib/data';
import { AccountForm } from '../../AccountForm';
import { ReconcileForm } from '../../MoneyForms';
import { reconcileAccount } from '../../money-actions';

export default async function EditAccountPage({ params }: PageProps<'/keuangan/akun/[id]'>) {
  const { id } = await params;
  const account = (await getAccounts(await db())).find((a) => a.id === id);
  if (!account) notFound();
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title={account.name} kicker={ACCOUNT_TYPE_LABEL[account.type]} back={{ href: '/keuangan', label: 'Uang' }} />
      <section className="card p-4">
        <p className="text-[13px] text-muted">Saldo sekarang</p>
        <p className="font-display text-[26px] font-extrabold"><Balance value={account.balance} /></p>
      </section>
      <section className="card p-4" id="cocokkan">
        <h2 className="h-section mb-1">Cocokkan saldo</h2>
        <p className="mb-3 text-[13px] text-muted">Isi saldo yang tertera di aplikasi aslinya. Selisihnya dicatat sebagai transaksi penyesuaian supaya saldo di Kompas sama.</p>
        <ReconcileForm action={reconcileAccount.bind(null, account.id)} />
      </section>
      <section className="card p-4">
        <h2 className="h-section mb-3">Ubah akun</h2>
        <AccountForm account={account} />
      </section>
    </div>
  );
}
