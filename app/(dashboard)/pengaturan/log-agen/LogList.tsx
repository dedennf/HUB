'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Chip } from '@/components/ui/Chip';
import { undoActions } from '@/lib/agent/client';
import type { CardView } from '@/lib/agent/cards';

export type LogItem = { card: CardView; summary: string; when: string };

const STATUS: Record<CardView['status'], { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }> = {
  proposed: { label: 'Menunggu', tone: 'warn' }, executed: { label: 'Dijalankan', tone: 'ok' }, rejected: { label: 'Ditolak', tone: 'neutral' },
  undone: { label: 'Dibatalkan', tone: 'neutral' }, failed: { label: 'Gagal', tone: 'danger' },
};

export function LogList({ items }: { items: LogItem[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const undo = (id: string) => start(async () => {
    setError(null);
    const r = await undoActions([id]).catch(() => ({ ok: false, message: 'Gagal membatalkan. Cek koneksi.' }));
    if (!r.ok) setError(r.message);
    router.refresh();
  });
  return (
    <>
      {error && <p role="alert" className="rounded-2xl bg-danger-bg p-3 text-[13px] text-danger-fg">{error}</p>}
      <ul className="card rows overflow-hidden">
        {items.map(({ card, summary, when }) => (
          <li key={card.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className={`text-[14px] font-semibold ${card.status === 'undone' || card.status === 'rejected' ? 'text-muted line-through' : ''}`}>{summary}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                <span>{when}</span>
                <Chip tone={STATUS[card.status].tone}>{STATUS[card.status].label}</Chip>
                {card.destructive && <Chip tone="danger">Destruktif</Chip>}
              </p>
            </div>
            {card.status === 'executed' && (
              <button type="button" className="btn shrink-0" disabled={busy} onClick={() => undo(card.id)} aria-label={`Batalkan ${summary}`}>Batalkan</button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
