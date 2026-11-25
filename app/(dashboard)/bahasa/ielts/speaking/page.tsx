import type { Metadata } from 'next';
import Link from 'next/link';
import { IeltsSpeaker } from '@/components/english/ielts/IeltsSpeaker';
import { PageHeader } from '@/components/ui/Section';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'IELTS Speaking' };

export default async function IeltsSpeakingPage({ searchParams }: { searchParams: Promise<{ part?: string }> }) {
  await requireUser();
  const raw = Number((await searchParams).part);
  const part = raw === 1 || raw === 3 ? raw : 2;
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title={`Speaking Part ${part}`} back={{ href: '/bahasa', label: 'Bahasa' }} />
      <nav aria-label="Pilih part" className="-mt-2 flex gap-2 text-[13px]">
        {[1, 2, 3].map((n) => (
          <Link key={n} href={`/bahasa/ielts/speaking?part=${n}`} aria-current={n === part ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-xl border px-3 ${n === part ? 'border-accent bg-accent-soft font-semibold text-accent-strong' : 'border-line'}`}>Part {n}</Link>
        ))}
      </nav>
      <IeltsSpeaker key={part} part={part} />
    </div>
  );
}
