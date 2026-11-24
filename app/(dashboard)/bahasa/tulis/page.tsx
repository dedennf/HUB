import type { Metadata } from 'next';
import { PageHeader, Section } from '@/components/ui/Section';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/data';
import { formatDateTimeId } from '@/lib/time';
import { Writer } from './Writer';

export const metadata: Metadata = { title: 'Tulis' };
const KIND: Record<string, string> = { free: 'Bebas', summary: 'Ringkasan jurnal', abstract: 'Draf abstrak', journal: 'Jurnal harian', english_mode: 'English Mode' };

export default async function TulisPage() {
  await requireUser();
  const { data } = await (await db()).from('writing_submissions').select('id,kind,original,feedback,created_at').order('created_at', { ascending: false }).limit(10);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Tulis" back={{ href: '/bahasa', label: 'Bahasa' }} />
      <Writer />
      {(data ?? []).length > 0 && (
        <Section title="Tulisan sebelumnya">
          <ul className="card rows overflow-hidden">
            {data!.map((w) => {
              const n = ((w.feedback as { mistakes?: unknown[] } | null)?.mistakes ?? []).length;
              return (
                <li key={w.id} className="px-4 py-2.5 text-[13px]">
                  <p className="truncate" lang="en">{w.original}</p>
                  <p className="text-[12px] text-muted">{KIND[w.kind ?? 'free'] ?? w.kind} · {n} catatan · {formatDateTimeId(w.created_at)}</p>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
