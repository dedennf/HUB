import type { Metadata } from 'next';
import { PageHeader, Section } from '@/components/ui/Section';
import { requireUser } from '@/lib/auth';
import { describeAction, describeTrigger } from '@/lib/automation/describe';
import { SYSTEM_AUTOMATIONS } from '@/lib/automation/system';
import { db } from '@/lib/data';
import { formatDateTimeId } from '@/lib/time';
import { AskRaButton } from './AskRaButton';
import { AutomationList, type AutomationItem } from './AutomationList';

export const metadata: Metadata = { title: 'Otomasi' };

/** SPEC 11: daftar aturan (bawaan dan buatan sendiri), sakelar aktif, riwayat jalan, tombol "Buat dengan Ra". */
export default async function OtomasiPage() {
  await requireUser();
  const s = await db();
  const [{ data: autos }, { data: runs }] = await Promise.all([
    s.from('automations').select('id,name,is_enabled,is_system,system_key,trigger,action,mode,auto_write,last_run_at,next_run_at,created_at').order('created_at'),
    s.from('automation_runs').select('automation_id,status,output,error,created_at').order('created_at', { ascending: false }).limit(300),
  ]);
  const order = new Map(SYSTEM_AUTOMATIONS.map((d, i) => [d.key, i]));
  const toItem = (a: NonNullable<typeof autos>[number]): AutomationItem => ({
    id: a.id, name: a.name, enabled: a.is_enabled, system: a.is_system, mode: a.mode, autoWrite: a.auto_write,
    description: describeAction(a.action as Record<string, unknown>), when: describeTrigger(a.trigger as Record<string, unknown>),
    lastRun: a.last_run_at ? formatDateTimeId(a.last_run_at) : null, nextRun: a.next_run_at ? formatDateTimeId(a.next_run_at) : null,
    runs: (runs ?? []).filter((r) => r.automation_id === a.id).slice(0, 8).map((r) => ({
      at: formatDateTimeId(r.created_at), status: r.status, text: r.error ?? String((r.output as { summary?: string } | null)?.summary ?? ''),
    })),
  });
  const system = (autos ?? []).filter((a) => a.is_system).sort((a, b) => (order.get(a.system_key ?? '') ?? 99) - (order.get(b.system_key ?? '') ?? 99)).map(toItem);
  const custom = (autos ?? []).filter((a) => !a.is_system).map(toItem);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Otomasi" back={{ href: '/saya', label: 'Saya' }} />
      <div className="card flex flex-col gap-3 p-4">
        <p className="text-[13px] text-muted">Tulis aturanmu ke Ra dengan kalimat biasa, mis. &quot;setiap tanggal 5 catat bayar wifi 150 ribu dari GoPay&quot;. Ra menampilkan pratinjau aturan untuk kamu setujui.</p>
        <div><AskRaButton /></div>
      </div>
      <Section title={`Buatan sendiri (${custom.length})`}>
        {custom.length ? <AutomationList items={custom} /> : <p className="card px-4 py-3 text-[13px] text-muted">Belum ada aturan buatan sendiri.</p>}
      </Section>
      <Section title="Bawaan">
        {system.length ? <AutomationList items={system} /> : <p className="card px-4 py-3 text-[13px] text-muted">Otomasi bawaan dipasang saat penjadwal berjalan pertama kali (tiap 5 menit). Bila belum muncul, penjadwal belum diatur. Lihat panduan di README.</p>}
      </Section>
    </div>
  );
}
