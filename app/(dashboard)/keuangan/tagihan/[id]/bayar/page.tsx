import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/Section';
import { db, getAccounts } from '@/lib/data';
import { formatDayShort, formatRp } from '@/lib/format';
import { todayIso } from '@/lib/time';
import { PaymentForm } from '../../../MoneyForms';
import { payBill } from '../../../money-actions';

export const metadata: Metadata = { title: 'Bayar tagihan' };
const FREQ = { monthly: 'maju 1 bulan', yearly: 'maju 1 tahun', once: 'tagihan dinonaktifkan' } as Record<string, string>;

export default async function PayBillPage({ params }: PageProps<'/keuangan/tagihan/[id]/bayar'>) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = await db();
  const [{ data: bill }, accounts] = await Promise.all([s.from('bills').select('id,name,amount,frequency,next_due_date,default_account_id').eq('id', id).maybeSingle(), getAccounts(s)]);
  if (!bill) notFound();
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title={`Bayar ${bill.name}`} back={{ href: '/keuangan?tab=rencana', label: 'Uang' }} />
      <p className="text-[13px] text-muted">
        {formatRp(bill.amount)}{bill.next_due_date ? ` · jatuh tempo ${formatDayShort(bill.next_due_date)}` : ''}. Setelah dibayar, pengeluaran dicatat dan jatuh tempo {FREQ[bill.frequency]}.{' '}
        <Link href={`/catat/tagihan/${bill.id}`} className="font-semibold text-accent">Ubah tagihan</Link>
      </p>
      <section className="card p-4">
        <PaymentForm action={payBill.bind(null, bill.id)} accounts={accounts.filter((a) => !a.is_archived).map((a) => ({ value: a.id, label: a.name }))}
          defaultAccount={bill.default_account_id} defaultAmount={bill.amount} today={todayIso()} submitLabel="Bayar" />
      </section>
    </div>
  );
}
