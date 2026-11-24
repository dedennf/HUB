import type { Metadata } from 'next';
import { VocabForm } from '@/components/english/VocabForm';
import { PageHeader, Section } from '@/components/ui/Section';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/data';
import { formatDateId, todayIso, zonedParts } from '@/lib/time';
import { VocabList, type VocabItem } from './VocabList';

export const metadata: Metadata = { title: 'Bank kata' };

/** SPEC 10.2.1: bank kosakata. Sumber kata: input manual, bacaan, kesalahan tulisan, dan saran Ra. */
export default async function BankKataPage() {
  await requireUser();
  const s = await db();
  const today = todayIso();
  const { data } = await s.from('vocab').select('id,term,meaning_id,example,due_at,interval_days').order('created_at', { ascending: false }).limit(500);
  const items: VocabItem[] = (data ?? []).map((v) => {
    const d = zonedParts(v.due_at).date;
    return { id: v.id, term: v.term, meaning_id: v.meaning_id, example: v.example, interval_days: v.interval_days, due: d <= today ? 'hari ini' : formatDateId(d) };
  });
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Bank kata" back={{ href: '/bahasa', label: 'Bahasa' }} />
      <Section title="Tambah kata"><div className="card p-4"><VocabForm /></div></Section>
      <Section title={`Semua kata (${items.length})`}><VocabList items={items} /></Section>
    </div>
  );
}
