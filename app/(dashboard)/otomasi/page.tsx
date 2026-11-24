import type { Metadata } from 'next';
import { EmptyState, PageHeader } from '@/components/ui/Section';
import { countActiveAutomations, db } from '@/lib/data';

export const metadata: Metadata = { title: 'Otomasi' };

export default async function OtomasiPage() {
  const active = await countActiveAutomations(await db());
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Otomasi" back={{ href: '/saya', label: 'Saya' }} />
      <div className="card">
        <EmptyState>
          {active ? `${active} aturan aktif. ` : 'Belum ada aturan otomatis. '}
          Briefing pagi, pengingat tenggat dan tagihan, peringatan budget, serta aturan yang kamu buat lewat Ra hadir di fase Otomasi dan Notifikasi.
        </EmptyState>
      </div>
    </div>
  );
}
