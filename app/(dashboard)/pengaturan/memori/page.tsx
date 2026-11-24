import type { Metadata } from 'next';
import { Chip } from '@/components/ui/Chip';
import { EmptyState, PageHeader } from '@/components/ui/Section';
import { loadLookups } from '@/lib/agent/service';
import { db, getAgentMemory } from '@/lib/data';

export const metadata: Metadata = { title: 'Memori Ra' };
const KIND: Record<string, string> = { alias: 'Alias', merchant_rule: 'Aturan merchant', habit: 'Kebiasaan', preference: 'Preferensi', correction: 'Koreksi' };

function show(v: unknown, names: Map<string, string>): string {
  if (!v || typeof v !== 'object') return String(v);
  const o = v as Record<string, unknown>;
  if (typeof o.text === 'string') return o.text;
  const PREFIX: Record<string, string> = { category_id: 'Kategori', account_id: 'Akun', course_id: 'Mata kuliah' };
  const parts = Object.entries(PREFIX).filter(([k]) => typeof o[k] === 'string').map(([k, label]) => `${label}: ${names.get(o[k] as string) ?? 'tidak ditemukan'}`);
  return parts.length ? parts.join(' · ') : JSON.stringify(v);
}

export default async function MemoriPage() {
  const s = await db();
  const [memory, lk] = await Promise.all([getAgentMemory(s), loadLookups(s)]);
  const names = new Map([...lk.accounts, ...lk.categories, ...lk.courses].map((x) => [x.id, x.name] as const));
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Memori Ra" back={{ href: '/saya', label: 'Saya' }} />
      <p className="text-[13px] text-muted">Hal yang Ra ingat tentang kebiasaanmu. Saat kamu mengganti kategori, akun, atau mata kuliah di kartu usulan, Ra mencatatnya di sini dan memakainya lagi di permintaan berikutnya.</p>
      {memory.length ? (
        <div className="card rows overflow-hidden">
          {memory.map((m) => (
            <div key={m.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2"><span className="text-[14px] font-semibold">{m.key.replace(/_/g, ' ')}</span><Chip>{KIND[m.kind] ?? m.kind}</Chip></div>
              <p className="mt-1 text-[13px] text-muted">{show(m.value, names)}</p>
            </div>
          ))}
        </div>
      ) : <div className="card"><EmptyState>Ra belum menyimpan memori apa pun.</EmptyState></div>}
    </div>
  );
}
