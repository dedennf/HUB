import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/Section';
import { ImportClient } from './ImportClient';

export const metadata: Metadata = { title: 'Cadangan & impor' };

export default function ImportPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Cadangan & impor" back={{ href: '/saya', label: 'Saya' }} />
      <p className="text-[13px] text-muted">Pindahkan data dari app lama (Hub Pribadi) lewat file cadangan JSON. Data dicek dulu sebelum disimpan, dan impor bisa diulang tanpa membuat data ganda.</p>
      <ImportClient />
    </div>
  );
}
