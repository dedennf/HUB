import type { Metadata } from 'next';
import { Chip } from '@/components/ui/Chip';
import { PageHeader, Section } from '@/components/ui/Section';
import { db, getCategories } from '@/lib/data';
import { formatRp } from '@/lib/format';

export const metadata: Metadata = { title: 'Kategori dan budget' };

export default async function KategoriPage() {
  const categories = await getCategories(await db());
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title="Kategori dan budget" back={{ href: '/pengaturan', label: 'Pengaturan' }} />
      <p className="text-[13px] text-muted">Menambah kategori dan mengatur budget dari layar ini hadir di fase berikutnya.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {(['expense', 'income'] as const).map((k) => (
          <Section key={k} title={k === 'expense' ? 'Pengeluaran' : 'Pemasukan'}>
            <div className="card rows overflow-hidden">
              {categories.filter((c) => c.kind === k).map((c) => (
                <div key={c.id} className={`flex min-h-[52px] items-center justify-between gap-3 px-4 py-2 ${c.is_hidden ? 'opacity-50' : ''}`}>
                  <span className="min-w-0"><span className="block text-[14px] font-semibold">{c.name}</span>{c.keywords.length > 0 && <span className="block truncate text-[12px] text-muted">{c.keywords.slice(0, 6).join(', ')}</span>}</span>
                  {c.monthly_budget != null && <Chip tone="info">{formatRp(c.monthly_budget)}</Chip>}
                </div>
              ))}
            </div>
          </Section>
        ))}
      </div>
    </div>
  );
}
