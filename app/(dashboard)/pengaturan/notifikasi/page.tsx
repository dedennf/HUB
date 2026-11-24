import type { Metadata } from 'next';
import { EmptyState, PageHeader, Section } from '@/components/ui/Section';
import { db, getSettings } from '@/lib/data';

export const metadata: Metadata = { title: 'Notifikasi' };
const fmt = (v: unknown) => (typeof v === 'string' ? v.replace(':', '.') : '-');

export default async function NotifikasiPage() {
  const s = await getSettings(await db(), ['briefing_time', 'recap_time', 'quiet_hours']);
  const quiet = Array.isArray(s.quiet_hours) ? `${fmt(s.quiet_hours[0])} sampai ${fmt(s.quiet_hours[1])}` : '-';
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Notifikasi" back={{ href: '/saya', label: 'Saya' }} />
      <div className="card"><EmptyState>Notifikasi push di HP dan laptop, briefing pagi, dan pengingat hadir di fase Otomasi dan Notifikasi. Belum ada notifikasi.</EmptyState></div>
      <Section title="Jadwal yang tersimpan">
        <div className="card rows overflow-hidden text-[14px]">
          <p className="flex min-h-11 items-center justify-between px-4"><span>Briefing pagi</span><span className="num font-semibold">{fmt(s.briefing_time)}</span></p>
          <p className="flex min-h-11 items-center justify-between px-4"><span>Rekap malam</span><span className="num font-semibold">{fmt(s.recap_time)}</span></p>
          <p className="flex min-h-11 items-center justify-between px-4"><span>Jam tenang</span><span className="num font-semibold">{quiet}</span></p>
        </div>
      </Section>
    </div>
  );
}
