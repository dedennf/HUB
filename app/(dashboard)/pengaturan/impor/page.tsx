import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/Section';
import { ImportClient } from './ImportClient';

export const metadata: Metadata = { title: 'Cadangan & impor' };

export default function ImportPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Cadangan & impor" back={{ href: '/saya', label: 'Saya' }} />
      <section className="card p-4">
        <h2 className="h-section mb-1">Unduh cadangan</h2>
        <p className="mb-3 text-[13px] text-muted">Simpan salinan seluruh data Kompas. Kunci dan token tidak ikut tersimpan.</p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/ekspor/json" className="btn btn-primary" download>Cadangan lengkap (JSON)</a>
          <a href="/api/ekspor/csv" className="btn" download>Transaksi (CSV)</a>
        </div>
      </section>
      <h2 className="h-section mt-2">Impor dari app lama</h2>
      <p className="text-[13px] text-muted">Pindahkan data dari app lama (Hub Pribadi) lewat file cadangan JSON. Data dicek dulu sebelum disimpan, dan impor bisa diulang tanpa membuat data ganda.</p>
      <ImportClient />
    </div>
  );
}
