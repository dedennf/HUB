'use client';
import { Trash2 } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { deleteVocab } from '../actions';

export type VocabItem = { id: string; term: string; meaning_id: string | null; example: string | null; due: string; interval_days: number };

export function VocabList({ items }: { items: VocabItem[] }) {
  const [q, setQ] = useState('');
  const [gone, setGone] = useState<string[]>([]);
  const [busy, start] = useTransition();
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return items.filter((v) => !gone.includes(v.id) && (!k || v.term.toLowerCase().includes(k) || (v.meaning_id ?? '').toLowerCase().includes(k)));
  }, [items, q, gone]);
  return (
    <div className="flex flex-col gap-3">
      <label><span className="sr-only">Cari kata</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kata atau arti" className="input" /></label>
      {list.length ? (
        <ul className="card rows overflow-hidden">
          {list.map((v) => (
            <li key={v.id} className="flex items-start gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold" lang="en">{v.term}</span>
                {v.meaning_id && <span className="block text-[13px]">{v.meaning_id}</span>}
                {v.example && <span className="block truncate text-[12px] italic text-muted" lang="en">{v.example}</span>}
                <span className="block text-[12px] text-muted">{v.interval_days >= 21 ? 'Dikuasai · ' : ''}ulang {v.due}</span>
              </span>
              <button type="button" disabled={busy} aria-label={`Hapus ${v.term}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-danger-fg"
                onClick={() => { if (confirm(`Hapus "${v.term}" dari bank kata?`)) start(async () => { if ((await deleteVocab(v.id)).ok) setGone((g) => [...g, v.id]); }); }}>
                <Trash2 size={18} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="card px-4 py-3 text-[13px] text-muted">{items.length ? 'Tidak ada yang cocok.' : 'Bank kata masih kosong.'}</p>}
    </div>
  );
}
