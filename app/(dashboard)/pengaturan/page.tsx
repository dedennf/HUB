import { Bell, Brain, DatabaseBackup, Palette, Tags, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import { Balance } from '@/components/ui/Balance';
import { MenuRow } from '@/components/ui/MenuRow';
import { PageHeader, Section } from '@/components/ui/Section';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/data';

export const metadata: Metadata = { title: 'Pengaturan' };

export default async function PengaturanPage() {
  const user = await requireUser();
  const { data } = await (await db()).rpc('check_account_balances');
  const rows = (data ?? []) as { account_id: string; name: string; stored: number; computed: number }[];
  const mismatch = rows.filter((r) => r.stored !== r.computed);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Pengaturan" back={{ href: '/saya', label: 'Saya' }} />
      <div className="card rows overflow-hidden">
        <MenuRow href="/pengaturan/profil" icon={UserRound} title="Profil" detail="Nama dan program studi untuk sapaan" />
        <MenuRow href="/pengaturan/tampilan" icon={Palette} title="Tampilan" detail="Tema terang, gelap, atau otomatis · privasi saldo" />
        <MenuRow href="/pengaturan/kategori" icon={Tags} title="Kategori dan budget" detail="Kategori pengeluaran dan pemasukan" />
        <MenuRow href="/pengaturan/memori" icon={Brain} title="Memori Ra" detail="Yang Ra ingat tentang kebiasaanmu" />
        <MenuRow href="/pengaturan/notifikasi" icon={Bell} title="Notifikasi" detail="Briefing, pengingat, jam tenang" />
        <MenuRow href="/pengaturan/impor" icon={DatabaseBackup} title="Cadangan & impor" detail="Pindahkan data dari app lama" />
      </div>
      <Section title="Pemeriksaan saldo">
        <div className="card p-4 text-[13px]">
          {rows.length === 0 ? <p className="text-muted">Belum ada akun.</p> : mismatch.length === 0 ? (
            <p className="text-positive">Saldo {rows.length} akun konsisten dengan seluruh transaksi.</p>
          ) : (
            <ul className="rows">
              {mismatch.map((r) => <li key={r.account_id} className="py-2 text-negative">{r.name}: tersimpan <Balance value={r.stored} />, seharusnya <Balance value={r.computed} /></li>)}
            </ul>
          )}
        </div>
      </Section>
      <Section title="Akun pengguna">
        <div className="card p-4">
          <p className="text-[13px]">Masuk sebagai <b>{user.email}</b></p>
          <form action="/auth/signout" method="post" className="mt-3"><button className="btn">Keluar</button></form>
        </div>
      </Section>
    </div>
  );
}
