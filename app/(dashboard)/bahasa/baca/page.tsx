import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader, Section } from '@/components/ui/Section';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/data';
import { Reader } from './Reader';

export const metadata: Metadata = { title: 'Baca jurnal' };

/** SPEC 10.2.2: membaca berpendamping. Teks dari bacaan modul Riset (?bacaan=id) atau ditempel langsung. */
export default async function BacaPage({ searchParams }: PageProps<'/bahasa/baca'>) {
  await requireUser();
  const sp = await searchParams;
  const id = typeof sp.bacaan === 'string' && /^[0-9a-f-]{36}$/i.test(sp.bacaan) ? sp.bacaan : null;
  const s = await db();
  const [{ data: reading }, { data: readings }] = await Promise.all([
    id ? s.from('readings').select('id,title,authors,year,content_excerpt').eq('id', id).maybeSingle() : Promise.resolve({ data: null }),
    s.from('readings').select('id,title,year,content_excerpt').order('created_at', { ascending: false }).limit(30),
  ]);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Baca jurnal" back={{ href: '/bahasa', label: 'Bahasa' }} />
      {reading && <p className="-mt-2 text-[13px] text-muted">{reading.title}{reading.authors ? ` · ${reading.authors}` : ''}{reading.year ? ` (${reading.year})` : ''}</p>}
      <Reader key={reading?.id ?? 'tempel'} readingId={reading?.id} title={reading?.title} initialText={reading?.content_excerpt ?? ''} />
      {!reading && (readings ?? []).length > 0 && (
        <Section title="Dari bacaan riset">
          <ul className="card rows overflow-hidden">
            {readings!.map((r) => (
              <li key={r.id}>
                <Link href={`/bahasa/baca?bacaan=${r.id}`} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2.5 text-[14px] hover:bg-bg">
                  <span className="min-w-0 flex-1 truncate">{r.title}{r.year ? ` (${r.year})` : ''}</span>
                  <span className="shrink-0 text-[12px] text-muted">{r.content_excerpt ? 'ada teks' : 'tempel teks'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
