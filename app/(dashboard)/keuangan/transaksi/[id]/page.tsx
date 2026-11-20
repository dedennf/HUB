import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageTitle, Section } from '@/components/ui';
import { db, getAccounts, getCategories, getTransaction } from '@/lib/data';
import { zonedParts } from '@/lib/time';
import { DeleteTransactionButton } from '../../DeleteTransactionButton';
import { TransactionForm } from '../../TransactionForm';

export default async function EditTransactionPage({ params }: PageProps<'/keuangan/transaksi/[id]'>) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = await db();
  const [tx, accounts, categories] = await Promise.all([getTransaction(s, id), getAccounts(s), getCategories(s)]);
  if (!tx) notFound();
  const { date, time } = zonedParts(tx.occurred_at);
  return (
    <>
      <PageTitle title="Ubah transaksi" right={<Link href="/keuangan?tab=transaksi" className="btn btn-sm">Kembali</Link>} />
      <div className="grid gap-4">
        <Section title="Detail">
          <TransactionForm accounts={accounts} categories={categories} initial={{ ...tx, date, time }} />
          {tx.group_id && <p className="mt-3 text-xs text-muted">Transaksi ini satu grup dengan biaya admin transfer. Ubah keduanya jika perlu.</p>}
        </Section>
        <Section title="Hapus"><DeleteTransactionButton id={tx.id} /></Section>
      </div>
    </>
  );
}
