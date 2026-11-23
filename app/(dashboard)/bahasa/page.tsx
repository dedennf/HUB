import type { Metadata } from 'next';
import { EmptyState, PageHeader } from '@/components/ui/Section';
import { countDueVocab, countVocab, db } from '@/lib/data';

export const metadata: Metadata = { title: 'Bahasa Inggris' };

export default async function BahasaPage() {
  const s = await db();
  const [total, due] = await Promise.all([countVocab(s), countDueVocab(s)]);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Bahasa Inggris" back={{ href: '/saya', label: 'Saya' }} />
      <div className="card">
        <EmptyState>
          {total ? `${total} kata tersimpan, ${due} siap diulang. ` : 'Belum ada kosakata. '}
          Review kartu, membaca jurnal berpendamping, koreksi tulisan, latihan bicara, dan English Mode hadir di fase Bahasa Inggris.
        </EmptyState>
      </div>
    </div>
  );
}
