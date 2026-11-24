import type { Metadata } from 'next';
import { EmptyState, PageHeader } from '@/components/ui/Section';
import { cardFor, type ActionRow } from '@/lib/agent/cards';
import { loadLookups } from '@/lib/agent/service';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/data';
import { todayIso, zonedParts } from '@/lib/time';
import { LogList, type LogItem } from './LogList';

export const metadata: Metadata = { title: 'Log Agen' };

/** SPEC 9: semua agent_actions dengan status dan tombol undo. */
export default async function LogAgenPage() {
  await requireUser();
  const s = await db();
  const today = todayIso();
  const [{ data }, lookups] = await Promise.all([
    s.from('agent_actions').select('id,tool_name,summary,permission,status,args,result,created_at,executed_at').order('created_at', { ascending: false }).limit(100),
    loadLookups(s),
  ]);
  const items: LogItem[] = (data ?? []).map((r) => {
    const at = zonedParts(r.executed_at ?? r.created_at);
    return { card: cardFor(r as ActionRow, lookups, today), summary: r.summary, when: `${at.date === today ? 'Hari ini' : at.date} ${at.time.replace(':', '.')}` };
  });
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Log Agen" back={{ href: '/saya', label: 'Saya' }} />
      <p className="text-[13px] text-muted">Semua aksi yang diusulkan Ra, 100 terakhir. Aksi yang sudah dijalankan bisa dibatalkan dari sini, saldo akun ikut kembali.</p>
      {items.length ? <LogList items={items} /> : <div className="card"><EmptyState>Belum ada aksi dari Ra.</EmptyState></div>}
    </div>
  );
}
