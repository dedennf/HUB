import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/Section';
import { requireUser } from '@/lib/auth';
import { BACKUP_BUCKET, BACKUPS_KEPT } from '@/lib/backup';
import { db } from '@/lib/data';
import { formatDateId } from '@/lib/time';
import { ImportClient } from './ImportClient';

export const metadata: Metadata = { title: 'Cadangan & impor' };

export default async function ImportPage() {
  const user = await requireUser();
  const s = await db();
  const { data: files } = await s.storage.from(BACKUP_BUCKET).list(user.id, { limit: 100, sortBy: { column: 'name', order: 'desc' } });
  const names = (files ?? []).map((f) => f.name).filter((n) => /^kompas-\d{4}-\d{2}-\d{2}\.json$/.test(n));
  const { data: signed } = names.length
    ? await s.storage.from(BACKUP_BUCKET).createSignedUrls(names.map((n) => `${user.id}/${n}`), 10 * 60, { download: true })
    : { data: [] };
  const auto = names.map((n, i) => ({ name: n, date: n.slice(7, 17), url: signed?.[i]?.signedUrl ?? null }));
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
      <section className="card p-4">
        <h2 className="h-section mb-1">Cadangan otomatis</h2>
        <p className="mb-3 text-[13px] text-muted">Dibuat tiap Minggu pukul 02.30 dan disimpan di penyimpanan privat Kompas. Hanya {BACKUPS_KEPT} cadangan terbaru yang disimpan. Bisa dimatikan di halaman Otomasi.</p>
        {auto.length ? (
          <ul className="rows">
            {auto.map((b) => (
              <li key={b.name} className="flex min-h-11 items-center justify-between gap-3 py-1.5 text-[14px]">
                <span>{formatDateId(b.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                {b.url ? <a href={b.url} className="btn" download={b.name}>Unduh</a> : <span className="text-[12px] text-muted">Tautan gagal dibuat</span>}
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-muted">Belum ada cadangan otomatis. Yang pertama dibuat Minggu ini.</p>}
      </section>
      <h2 className="h-section mt-2">Impor dari app lama</h2>
      <p className="text-[13px] text-muted">Pindahkan data dari app lama (Hub Pribadi) lewat file cadangan JSON. Data dicek dulu sebelum disimpan, dan impor bisa diulang tanpa membuat data ganda.</p>
      <ImportClient />
    </div>
  );
}
