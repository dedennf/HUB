import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Money, PageTitle, Section } from '@/components/ui';
import { db, getAccounts } from '@/lib/data';
import { AccountForm } from '../../AccountForm';

export default async function EditAccountPage({ params }: PageProps<'/keuangan/akun/[id]'>) {
  const { id } = await params;
  const accounts = await getAccounts(await db());
  const account = accounts.find((a) => a.id === id);
  if (!account) notFound();
  return (
    <>
      <PageTitle title={account.name} kicker="Akun" right={<Link href="/keuangan" className="btn btn-sm">Kembali</Link>} />
      <div className="grid gap-4">
        <Section title="Saldo sekarang"><Money value={account.balance} signed className="text-2xl font-semibold" /></Section>
        <Section title="Ubah akun"><AccountForm account={account} /></Section>
      </div>
    </>
  );
}
