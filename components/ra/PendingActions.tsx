'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { CardView, Lookups } from '@/lib/agent/cards';
import { confirmActions } from '@/lib/agent/client';
import { RaAvatar } from './RaMark';
import { ProposalCard, type ChipEdit } from './ProposalCard';

/**
 * Usulan yang menunggu konfirmasi di Beranda (SPEC 8.1): dari otomasi (saran slot, aturan tanpa auto_write)
 * dan dari percakapan Ra yang belum diputuskan. Setujui atau tolak per kartu.
 */
export function PendingActions({ cards, lookups }: { cards: CardView[]; lookups: Lookups }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, Record<string, ChipEdit>>>({});
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const list = cards.filter((c) => !hidden.includes(c.id));
  if (!list.length && !msg) return null;

  const decide = (c: CardView, decision: 'approve' | 'reject') => start(async () => {
    setMsg(null);
    const e = edits[c.id] ? { [c.id]: Object.fromEntries(Object.entries(edits[c.id]).map(([k, v]) => [k, v.value])) } : undefined;
    const r = await confirmActions([c.id], decision, e).catch(() => ({ ok: false, message: 'Gagal menghubungi server.' }));
    if (!r.ok) { setMsg(r.message); return; }
    setHidden((h) => [...h, c.id]);
    setMsg(decision === 'approve' ? r.message : 'Usulan ditolak.');
    router.refresh();
  });

  return (
    <section aria-label="Usulan Ra menunggu" className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <RaAvatar size={28} />
        <h2 className="h-section">{list.length ? `${list.length} usulan Ra menunggu` : 'Usulan Ra'}</h2>
      </div>
      {msg && <p role="status" className="text-[13px] text-muted">{msg}</p>}
      {list.map((c) => (
        <div key={c.id} className="flex flex-col gap-2">
          <ProposalCard card={c} lookups={lookups} edits={edits[c.id]} onEdit={(f, v) => setEdits((x) => ({ ...x, [c.id]: { ...x[c.id], [f]: v } }))} />
          <div className="grid grid-cols-3 gap-3">
            <button type="button" className="btn" disabled={busy} onClick={() => decide(c, 'reject')}>Tolak</button>
            <button type="button" className={`btn col-span-2 ${c.destructive ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={() => decide(c, 'approve')}>Setujui</button>
          </div>
        </div>
      ))}
    </section>
  );
}
