import type { Metadata } from 'next';
import { IeltsReader } from '@/components/english/ielts/IeltsReader';
import { PageHeader } from '@/components/ui/Section';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'IELTS Reading' };

export default async function IeltsReadingPage() {
  await requireUser();
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Reading" back={{ href: '/bahasa', label: 'Bahasa' }} />
      <p className="-mt-2 text-[13px] text-muted">Latihan IELTS Academic Reading versi pendek · sekitar 8 menit</p>
      <IeltsReader />
    </div>
  );
}
