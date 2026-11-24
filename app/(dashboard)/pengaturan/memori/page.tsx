import type { Metadata } from 'next';
import { Chip } from '@/components/ui/Chip';
import { EmptyState, PageHeader } from '@/components/ui/Section';
import { db, getAgentMemory } from '@/lib/data';

export const metadata: Metadata = { title: 'Memori Ra' };
const KIND: Record<string, string> = { alias: 'Alias', merchant_rule: 'Aturan merchant', habit: 'Kebiasaan', preference: 'Preferensi', correction: 'Koreksi' };

function show(v: unknown): string {
  if (v && typeof v === 'object' && 'text' in v) return String((v as { text: unknown }).text);
  return JSON.stringify(v);
}

export default async function MemoriPage() {
  const memory = await getAgentMemory(await db());
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Memori Ra" back={{ href: '/saya', label: 'Saya' }} />
      <p className="text-[13px] text-muted">Hal yang Ra ingat tentang kebiasaanmu. Ra mulai belajar dari koreksimu setelah tersambung ke Gemini. Mengubah dan menghapus memori hadir bersama Ra.</p>
      {memory.length ? (
        <div className="card rows overflow-hidden">
          {memory.map((m) => (
            <div key={m.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2"><span className="text-[14px] font-semibold">{m.key.replace(/_/g, ' ')}</span><Chip>{KIND[m.kind] ?? m.kind}</Chip></div>
              <p className="mt-1 text-[13px] text-muted">{show(m.value)}</p>
            </div>
          ))}
        </div>
      ) : <div className="card"><EmptyState>Ra belum menyimpan memori apa pun.</EmptyState></div>}
    </div>
  );
}
