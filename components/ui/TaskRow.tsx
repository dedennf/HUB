'use client';
import { Check } from 'lucide-react';
import { useOptimistic, useTransition } from 'react';
import { setTaskDone } from '@/app/(dashboard)/kuliah/actions';
import { Chip, type ChipTone } from './Chip';

/** Lingkaran centang 28 px (tombol), judul, keterangan, chip tenggat. Centang benar-benar menyimpan status. */
export function TaskRow({ id, title, detail, dueLabel, dueTone = 'neutral', done }: {
  id: string; title: string; detail?: string; dueLabel?: string; dueTone?: ChipTone; done: boolean;
}) {
  const [optimisticDone, setOptimistic] = useOptimistic(done);
  const [pending, start] = useTransition();
  const toggle = () => start(async () => {
    setOptimistic(!optimisticDone);
    await setTaskDone(id, !optimisticDone);
  });
  return (
    <div className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
      <button type="button" onClick={toggle} disabled={pending} role="checkbox" aria-checked={optimisticDone}
        aria-label={optimisticDone ? `Tandai "${title}" belum selesai` : `Tandai "${title}" selesai`}
        className="-m-2 inline-flex h-11 w-11 shrink-0 items-center justify-center">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border-2 ${optimisticDone ? 'border-accent bg-accent-fill text-on-accent' : 'border-line'}`}>
          {optimisticDone && <Check size={16} strokeWidth={2.5} aria-hidden="true" />}
        </span>
      </button>
      <span className="min-w-0 flex-1">
        <span className={`block text-[14px] font-semibold ${optimisticDone ? 'text-muted line-through' : ''}`}>{title}</span>
        {detail && <span className="block text-[12px] text-muted">{detail}</span>}
      </span>
      {dueLabel && !optimisticDone && <Chip tone={dueTone}>{dueLabel}</Chip>}
    </div>
  );
}
