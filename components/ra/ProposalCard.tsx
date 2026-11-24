'use client';
import {
  ArrowLeftRight, BookA, CalendarCheck, CalendarDays, ClipboardList, FileText, Lightbulb, Sparkles, Trash2, TrendingDown, TrendingUp, type LucideIcon,
} from 'lucide-react';
import { useId, useState } from 'react';
import type { CardChip, CardIcon, CardView, Lookups } from '@/lib/agent/cards';
import { ActionCard } from './ActionCard';

const ICON: Record<CardIcon, LucideIcon> = {
  expense: TrendingDown, income: TrendingUp, transfer: ArrowLeftRight, task: CalendarCheck, event: CalendarDays, idea: Lightbulb,
  need: ClipboardList, vocab: BookA, delete: Trash2, other: Sparkles,
};
const TONE: Record<CardIcon, 'expense' | 'income' | 'task' | 'neutral'> = {
  expense: 'expense', income: 'income', transfer: 'neutral', task: 'task', event: 'neutral', idea: 'neutral', need: 'neutral', vocab: 'neutral', delete: 'expense', other: 'neutral',
};
const FIELD_LABEL: Record<string, string> = {
  amount: 'nominal', category: 'kategori', account: 'akun', from_account: 'akun asal', to_account: 'akun tujuan', occurred_at: 'tanggal', course: 'mata kuliah', due_at: 'tenggat',
};

export type ChipEdit = { value: string; label: string };

function options(chip: CardChip, lk: Lookups): { value: string; label: string }[] {
  switch (chip.edit) {
    case 'account': return lk.accounts.map((a) => ({ value: a.id, label: a.name }));
    case 'category_expense': return lk.categories.filter((c) => c.kind === 'expense').map((c) => ({ value: c.id, label: c.name }));
    case 'category_income': return lk.categories.filter((c) => c.kind === 'income').map((c) => ({ value: c.id, label: c.name }));
    case 'course': return lk.courses.map((c) => ({ value: c.id, label: c.name }));
    default: return [];
  }
}

const fmtDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Kartu usulan dari server. Chip ber-`field` bisa diketuk untuk memilih nilai lain sebelum disetujui. */
export function ProposalCard({ card, lookups, edits, onEdit, onRemove, readOnly }: {
  card: CardView; lookups?: Lookups; edits?: Record<string, ChipEdit>; onEdit?: (field: string, e: ChipEdit) => void; onRemove?: () => void; readOnly?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const uid = useId();
  const chips = card.chips.map((c) => {
    const edited = c.field ? edits?.[c.field] : undefined;
    const canEdit = !readOnly && !!c.field && !!c.edit && !!onEdit && !!lookups;
    return {
      label: edited?.label ?? c.label, doubtful: edited ? false : c.doubtful, onEditLabel: c.field ? FIELD_LABEL[c.field] : undefined,
      active: open === c.field, onEdit: canEdit ? () => setOpen((o) => (o === c.field ? null : c.field!)) : undefined,
    };
  });
  const chip = card.chips.find((c) => c.field === open);
  const current = chip?.field ? (edits?.[chip.field]?.value ?? chip.value ?? '') : '';
  const editorId = `${uid}-editor`;
  const commit = (value: string, label: string) => { if (chip?.field) onEdit?.(chip.field, { value, label }); setOpen(null); };
  const amount = edits?.amount ? `Rp${Number(edits.amount.value).toLocaleString('id-ID')}` : card.value;

  return (
    <ActionCard icon={ICON[card.icon]} tone={TONE[card.icon]} kindLabel={card.kindLabel} value={amount} chips={chips}
      note={card.note} noteWarn={card.warn} destructive={card.destructive} onRemove={readOnly ? undefined : onRemove}>
      {card.receipt_url && (
        <a href={card.receipt_url} target="_blank" rel="noreferrer" className="mt-3 flex min-h-11 items-center gap-3 rounded-xl border border-line px-2 py-1.5 text-[12px] font-semibold text-accent hover:border-accent">
          {card.receipt_mime?.startsWith('image/') && card.receipt_mime !== 'image/heic' && card.receipt_mime !== 'image/heif'
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={card.receipt_url} alt="" className="h-10 w-8 rounded-md object-cover" />
            : <FileText size={20} strokeWidth={1.8} aria-hidden="true" />}
          Lihat struk asli<span className="sr-only"> (tab baru)</span>
        </a>
      )}
      {chip && lookups && (
        <div className="mt-2">
          <label htmlFor={editorId} className="mb-1 block text-[12px] text-muted">Ganti {FIELD_LABEL[chip.field!] ?? chip.field}</label>
          {chip.edit === 'amount' ? (
            <form className="flex gap-2" onSubmit={(e) => {
              e.preventDefault();
              const raw = (e.currentTarget.elements.namedItem('amount') as HTMLInputElement).value.replace(/\D/g, '');
              const n = Number(raw);
              if (n > 0) commit(String(n), `Rp${n.toLocaleString('id-ID')}`);
            }}>
              <input id={editorId} name="amount" inputMode="numeric" defaultValue={current} className="input flex-1" autoFocus />
              <button type="submit" className="btn btn-primary">Pakai</button>
            </form>
          ) : chip.edit === 'date' || chip.edit === 'datetime' ? (
            <input id={editorId} type={chip.edit === 'date' ? 'date' : 'datetime-local'} defaultValue={current} className="input w-full"
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                commit(v, chip.edit === 'date' ? fmtDate(v) : `Tenggat ${fmtDate(v)} · ${v.slice(11, 16).replace(':', '.')}`);
              }} />
          ) : (
            <select id={editorId} value={current} className="input w-full" onChange={(e) => {
              const o = options(chip, lookups).find((x) => x.value === e.target.value);
              if (o) commit(o.value, chip.field === 'to_account' ? `ke ${o.label}` : o.label);
            }}>
              {!current && <option value="">Pilih...</option>}
              {options(chip, lookups).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
        </div>
      )}
    </ActionCard>
  );
}
