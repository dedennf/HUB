'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { finishReview, gradeCard } from '@/app/(dashboard)/bahasa/actions';

export type ReviewCard = { id: string; term: string; meaning_id: string | null; definition_en: string | null; example: string | null; part_of_speech: string | null; source: string | null };

const GRADES = [
  { grade: 1, label: 'Lupa', cls: 'border-danger-fg/30 bg-danger-bg text-danger-fg' },
  { grade: 3, label: 'Sulit', cls: 'border-warn-fg/30 bg-warn-bg text-warn-fg' },
  { grade: 4, label: 'Bisa', cls: 'border-line bg-surface text-fg' },
  { grade: 5, label: 'Mudah', cls: 'border-accent-fill bg-accent-fill text-on-accent' },
] as const;

/** Flashcard SM-2 (SPEC 10.2.1, DESIGN Flashcard): ketuk untuk melihat arti, lalu nilai Lupa, Sulit, Bisa, atau Mudah. */
export function ReviewDeck({ cards: initial }: { cards: ReviewCard[] }) {
  const router = useRouter();
  // kartu sesi dibekukan: penyegaran halaman setelah kartu terakhir tidak boleh mengganti pesan "Selesai"
  const [cards] = useState(initial);
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef<number | null>(null);
  const [doneCount, setDoneCount] = useState(0);

  if (!cards.length) return <p className="card px-4 py-5 text-center text-[13px] text-muted">Tidak ada kartu yang jatuh tempo. Tambah kata baru dari bacaan atau tulisanmu.</p>;
  if (i >= cards.length) {
    return (
      <section aria-label="Review kosakata" className="card px-4 py-5 text-center">
        <p role="status" className="font-display text-[16px] font-bold">Selesai, {doneCount} kartu diulang</p>
        <p className="text-[13px] text-muted">Kartu berikutnya muncul sesuai jadwal ulangnya.</p>
      </section>
    );
  }
  const c = cards[i];
  const grade = (g: number) => start(async () => {
    setError(null);
    startedAt.current ??= Date.now();
    const r = await gradeCard(c.id, g);
    if (!r.ok) { setError(r.message); return; }
    const count = doneCount + 1;
    setDoneCount(count);
    setShown(false);
    if (i + 1 >= cards.length) {
      await finishReview(count, (Date.now() - (startedAt.current ?? Date.now())) / 1000);
      router.refresh();
    }
    setI(i + 1);
  });

  return (
    <section aria-label="Review kosakata" className="card p-4">
      <p className="text-[12px] text-muted">Kartu {i + 1} dari {cards.length}{c.source ? ` · ${c.source}` : ''}</p>
      <button type="button" onClick={() => { startedAt.current ??= Date.now(); setShown(true); }} disabled={shown}
        aria-expanded={shown} className="mt-2 flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-2xl bg-bg px-4 py-5 text-center">
        <span className="font-display text-[26px] font-extrabold" lang="en">{c.term}</span>
        {c.part_of_speech && <span className="text-[12px] text-muted" lang="en">{c.part_of_speech}</span>}
        {shown ? (
          <>
            {c.meaning_id && <span className="text-[15px]">{c.meaning_id}</span>}
            {c.definition_en && <span className="text-[13px] text-muted" lang="en">{c.definition_en}</span>}
            {c.example && <span className="text-[13px] italic" lang="en">&ldquo;{c.example}&rdquo;</span>}
          </>
        ) : <span className="text-[13px] text-accent">Ketuk untuk melihat arti</span>}
      </button>
      <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label="Seberapa ingat">
        {GRADES.map((g) => (
          <button key={g.grade} type="button" disabled={!shown || busy} onClick={() => grade(g.grade)}
            className={`min-h-11 rounded-xl border text-[13px] font-semibold disabled:opacity-40 ${g.cls}`}>{g.label}</button>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-[13px] text-danger-fg">{error}</p>}
    </section>
  );
}
