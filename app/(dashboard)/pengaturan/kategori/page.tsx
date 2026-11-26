import type { Metadata } from 'next';
import { Chip } from '@/components/ui/Chip';
import Link from 'next/link';
import { AddButton, PageHeader, Section } from '@/components/ui/Section';
import { db, getCategories } from '@/lib/data';
import { formatRp } from '@/lib/format';

export const metadata: Metadata = { title: 'Kategori dan budget' };

export default async function KategoriPage() {
  const categories = await getCategories(await db());
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title="Kategori dan budget" back={{ href: '/pengaturan', label: 'Pengaturan' }} right={<AddButton href="/catat/kategori" label="Tambah kategori" />} />
      <p className="text-[13px] text-muted">Ketuk kategori untuk mengubah nama, kata kunci, atau budget bulanan.</p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(['expense', 'income'] as const).map((k) => (
          <Section key={k} title={k === 'expense' ? 'Pengeluaran' : 'Pemasukan'} add={{ href: `/catat/kategori?kind=${k}`, label: `Tambah kategori ${k === 'expense' ? 'pengeluaran' : 'pemasukan'}` }}>
            <div className="card rows overflow-hidden">
              {categories.filter((c) => c.kind === k).map((c) => (
                <Link key={c.id} href={`/catat/kategori/${c.id}`} className={`flex min-h-[52px] items-center justify-between gap-3 px-4 py-2 hover:bg-bg ${c.is_hidden ? 'opacity-60' : ''}`}>
                  <span className="min-w-0"><span className="block text-[14px] font-semibold">{c.name}</span>{c.keywords.length > 0 && <span className="block truncate text-[12px] text-muted">{c.keywords.slice(0, 6).join(', ')}</span>}</span>
                  {c.monthly_budget != null && <Chip tone="info">{formatRp(c.monthly_budget)}</Chip>}
                </Link>
              ))}
            </div>
          </Section>
        ))}
      </div>
    </div>
  );
}
