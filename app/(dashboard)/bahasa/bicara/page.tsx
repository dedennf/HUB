import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/Section';
import { requireUser } from '@/lib/auth';
import { Speaker } from './Speaker';

export const metadata: Metadata = { title: 'Bicara' };

export default async function BicaraPage() {
  await requireUser();
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Latihan bicara" back={{ href: '/bahasa', label: 'Bahasa' }} />
      <Speaker />
    </div>
  );
}
