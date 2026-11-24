'use client';
import { ChevronDown, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Chip } from '@/components/ui/Chip';
import { deleteCustomAutomation, setAutomationEnabled } from '@/app/(dashboard)/pengaturan/actions';

export type AutomationItem = {
  id: string; name: string; description: string; enabled: boolean; system: boolean; mode: 'rule' | 'agent'; autoWrite: boolean;
  when: string; lastRun: string | null; nextRun: string | null;
  runs: { at: string; status: 'success' | 'skipped' | 'failed'; text: string }[];
};
const STATUS = { success: { label: 'Berhasil', tone: 'ok' }, skipped: { label: 'Dilewati', tone: 'neutral' }, failed: { label: 'Gagal', tone: 'danger' } } as const;

function Row({ a }: { a: AutomationItem }) {
  const [enabled, setEnabled] = useState(a.enabled);
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;
  const id = `auto-${a.id}`;
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
            <span id={id}>{a.name}</span>
            {a.system && <Chip>Bawaan</Chip>}
            {a.mode === 'agent' && <Chip tone="info">Saran</Chip>}
            {a.autoWrite && <Chip tone="warn">Tanpa konfirmasi</Chip>}
          </p>
          <p className="text-[13px] text-muted">{a.description}</p>
          <p className="mt-0.5 text-[12px] text-muted">{a.when}{enabled && a.nextRun ? ` · berikutnya ${a.nextRun}` : ''}{a.lastRun ? ` · terakhir ${a.lastRun}` : ''}</p>
        </div>
        <button
          type="button" role="switch" aria-checked={enabled} aria-labelledby={id} disabled={busy}
          onClick={() => { const v = !enabled; setEnabled(v); start(async () => { const r = await setAutomationEnabled(a.id, v); if (!r.ok) setEnabled(!v); }); }}
          className="group relative inline-flex h-11 w-14 shrink-0 items-center justify-end rounded-full focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className={`h-7 w-12 rounded-full transition-colors ${enabled ? 'bg-accent-fill' : 'bg-track'}`} aria-hidden="true" />
          <span className={`absolute right-6 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-accent">
          Riwayat ({a.runs.length}) <ChevronDown size={16} className={open ? 'rotate-180' : ''} aria-hidden="true" />
        </button>
        {!a.system && (
          <button type="button" disabled={busy} onClick={() => { if (confirm(`Hapus otomasi "${a.name}"?`)) start(async () => { if ((await deleteCustomAutomation(a.id)).ok) setGone(true); }); }}
            className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center text-danger-fg" aria-label={`Hapus otomasi ${a.name}`}>
            <Trash2 size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}
      </div>
      {open && (a.runs.length ? (
        <ul className="mt-1 flex flex-col gap-1.5">
          {a.runs.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-[12px]">
              <Chip tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Chip>
              <span className="min-w-0 flex-1 text-muted"><span className="text-fg">{r.at}</span> · {r.text}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-[12px] text-muted">Belum pernah berjalan.</p>)}
    </li>
  );
}

export function AutomationList({ items }: { items: AutomationItem[] }) {
  return <ul className="card rows overflow-hidden">{items.map((a) => <Row key={a.id} a={a} />)}</ul>;
}
