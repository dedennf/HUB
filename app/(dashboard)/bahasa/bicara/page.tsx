import type { Metadata } from 'next';
import { LiveCall } from '@/components/live/LiveCall';
import { PageHeader, Section } from '@/components/ui/Section';
import { requireUser } from '@/lib/auth';
import { Speaker } from './Speaker';

export const metadata: Metadata = { title: 'Bicara' };

export default async function BicaraPage() {
  await requireUser();
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Latihan bicara" back={{ href: '/bahasa', label: 'Bahasa' }} />
      <Speaker />
      <Section title="Percakapan langsung">
        <div className="card flex min-h-80 flex-col p-4"><LiveCall mode="english" /></div>
      </Section>
    </div>
  );
}
