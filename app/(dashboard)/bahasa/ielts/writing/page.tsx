import type { Metadata } from 'next';
import Link from 'next/link';
import { IeltsWriter } from '@/components/english/ielts/IeltsWriter';
import { PageHeader } from '@/components/ui/Section';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'IELTS Writing' };

export default async function IeltsWritingPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  await requireUser();
  const task = (await searchParams).task === '1' ? 1 : 2;
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title={`Writing Task ${task}`} back={{ href: '/bahasa', label: 'Bahasa' }} />
      <nav aria-label="Pilih task" className="-mt-2 flex gap-2 text-[13px]">
        {[1, 2].map((t) => (
          <Link key={t} href={`/bahasa/ielts/writing?task=${t}`} aria-current={t === task ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-xl border px-3 ${t === task ? 'border-accent bg-accent-soft font-semibold text-accent-strong' : 'border-line'}`}>Task {t}</Link>
        ))}
      </nav>
      <IeltsWriter key={task} task={task} />
    </div>
  );
}
