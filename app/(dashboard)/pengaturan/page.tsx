import Link from 'next/link';
import type { Metadata } from 'next';
import { Money, PageTitle, Section } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/data';

export const metadata: Metadata = { title: 'Pengaturan' };

export default async function PengaturanPage() {
  const user = await requireUser();
  const s = await db();
  const { data: check } = await s.rpc('check_account_balances');
  const rows = (check ?? []) as { account_id: string; name: string; stored: number; computed: number }[];
  const mismatch = rows.filter((r) => r.stored !== r.computed);
  return (
    <>
      <PageTitle title="Pengaturan" />
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Akun pengguna">
          <p className="text-sm">Masuk sebagai <b>{user.email}</b></p>
          <form action="/auth/signout" method="post" className="mt-3"><button className="btn">Keluar</button></form>
        </Section>
        <Section title="Pindahkan data app lama">
          <p className="mb-3 text-sm text-muted">Unggah file cadangan JSON dari Hub Pribadi versi lama. Data dicek dulu sebelum disimpan, dan impor bisa diulang tanpa membuat data ganda.</p>
          <Link href="/pengaturan/impor" className="btn btn-primary">Impor cadangan</Link>
        </Section>
        <Section title="Pemeriksaan saldo">
          {rows.length === 0 ? <p className="text-sm text-muted">Belum ada akun.</p> : mismatch.length === 0 ? (
            <p className="text-sm text-positive">Saldo {rows.length} akun konsisten dengan seluruh transaksi.</p>
          ) : (
            <div className="list">
              {mismatch.map((r) => (
                <div key={r.account_id} className="row text-sm text-danger"><span>{r.name}</span><span>tersimpan <Money value={r.stored} />, seharusnya <Money value={r.computed} /></span></div>
              ))}
            </div>
          )}
        </Section>
        <Section title="Pasang di HP">
          <p className="text-sm text-muted">Android (Chrome): menu titik tiga, lalu Instal aplikasi. iPhone (Safari): tombol Bagikan, lalu Tambah ke Layar Utama. Perubahan dari laptop langsung muncul di HP selama aplikasi terbuka dan tersambung internet.</p>
        </Section>
      </div>
    </>
  );
}
