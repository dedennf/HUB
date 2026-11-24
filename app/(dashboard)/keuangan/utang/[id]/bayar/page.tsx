import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/Section';
import { db, getAccounts } from '@/lib/data';
import { formatRp } from '@/lib/format';
import { todayIso } from '@/lib/time';
import { PaymentForm } from '../../../MoneyForms';
import { payDebt } from '../../../money-actions';

export const metadata: Metadata = { title: 'Catat cicilan' };

export default async function PayDebtPage({ params }: PageProps<'/keuangan/utang/[id]/bayar'>) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = await db();
  const [{ data: debt }, accounts] = await Promise.all([s.from('debts').select('id,direction,person,amount,paid_amount').eq('id', id).maybeSingle(), getAccounts(s)]);
  if (!debt) notFound();
  const rest = debt.amount - debt.paid_amount;
  const receivable = debt.direction === 'receivable';
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title={receivable ? `Terima dari ${debt.person}` : `Bayar ke ${debt.person}`} back={{ href: '/keuangan?tab=rencana', label: 'Uang' }} />
      <p className="text-[13px] text-muted">
        Sisa {formatRp(rest)} dari {formatRp(debt.amount)}. <Link href={`/catat/utang/${debt.id}`} className="font-semibold text-accent">Ubah data</Link>
      </p>
      <section className="card p-4">
        {rest > 0 ? (
          <PaymentForm action={payDebt.bind(null, debt.id)} accounts={accounts.filter((a) => !a.is_archived).map((a) => ({ value: a.id, label: a.name }))}
            defaultAmount={rest} today={todayIso()} accountOptional submitLabel={receivable ? 'Catat diterima' : 'Catat dibayar'} />
        ) : <p className="text-[13px] text-positive">Sudah lunas.</p>}
      </section>
    </div>
  );
}
