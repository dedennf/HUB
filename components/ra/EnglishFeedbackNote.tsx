import { Languages } from 'lucide-react';
import type { EnglishFeedback } from '@/lib/agent/service';

/** Umpan balik English Mode di bawah balasan Ra: kecil, tidak mengganggu (SPEC 10.2.5). */
export function EnglishFeedbackNote({ fb }: { fb: EnglishFeedback }) {
  if (!fb.corrected && !fb.notes.length) return null;
  return (
    <aside aria-label="Umpan balik bahasa Inggris" className="rounded-2xl border border-line bg-surface px-3 py-2.5 text-[12px]">
      <p className="flex items-center gap-1.5 font-semibold text-accent"><Languages size={14} strokeWidth={1.8} aria-hidden="true" /> English check</p>
      {fb.notes.length === 0
        ? <p className="mt-1 text-muted">Bahasa Inggrismu sudah tepat.</p>
        : <>
          {fb.corrected && <p className="mt-1 italic">{fb.corrected}</p>}
          <ul className="mt-1.5 flex flex-col gap-1 text-muted">
            {fb.notes.map((n, i) => (
              <li key={i}><span className="line-through">{n.original}</span> → <span className="font-semibold text-fg">{n.fix}</span>. {n.explanation_id}</li>
            ))}
          </ul>
        </>}
    </aside>
  );
}
