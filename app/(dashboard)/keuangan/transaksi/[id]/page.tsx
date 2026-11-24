import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/Section';
import { db, getAccounts, getCategories, getTransaction } from '@/lib/data';
import { signedReceiptUrl } from '@/lib/receipts/service';
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
  // struk sumber (Fase 4): signed URL 10 menit, bucket tetap privat
  const { data: rc } = await s.from('transactions').select('receipts(storage_path)').eq('id', id).maybeSingle();
  const path = (rc?.receipts as { storage_path?: string } | null)?.storage_path;
  const receiptUrl = path ? await signedReceiptUrl(s, path) : undefined;
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Ubah transaksi" back={{ href: '/keuangan?tab=transaksi', label: 'Uang' }} />
      <section className="card p-4">
        <TransactionForm accounts={accounts} categories={categories} initial={{ ...tx, date, time }} />
        {receiptUrl && (
          <a href={receiptUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center text-[13px] font-semibold text-accent hover:underline">
            Lihat struk asli<span className="sr-only"> (tab baru)</span>
          </a>
        )}
        {tx.group_id && <p className="mt-3 text-[12px] text-muted">Transaksi ini satu grup dengan biaya admin transfer. Ubah keduanya jika perlu.</p>}
      </section>
      <section className="card p-4">
        <h2 className="h-section mb-2">Hapus</h2>
        <DeleteTransactionButton id={tx.id} />
      </section>
    </div>
  );
}
