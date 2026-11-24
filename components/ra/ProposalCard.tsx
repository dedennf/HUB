'use client';
import {
  ArrowLeftRight, BookA, CalendarCheck, CalendarDays, ClipboardList, Lightbulb, Sparkles, Trash2, TrendingDown, TrendingUp, type LucideIcon,
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
  category: 'kategori', account: 'akun', from_account: 'akun asal', to_account: 'akun tujuan', occurred_at: 'tanggal', course: 'mata kuliah', due_at: 'tenggat',
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

  return (
    <ActionCard icon={ICON[card.icon]} tone={TONE[card.icon]} kindLabel={card.kindLabel} value={card.value} chips={chips}
      note={card.note} noteWarn={card.warn} destructive={card.destructive} onRemove={readOnly ? undefined : onRemove}>
      {chip && lookups && (
        <div className="mt-2">
          <label htmlFor={editorId} className="mb-1 block text-[12px] text-muted">Ganti {FIELD_LABEL[chip.field!] ?? chip.field}</label>
          {chip.edit === 'date' || chip.edit === 'datetime' ? (
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
