'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { newReadingSet, submitReading } from '@/app/(dashboard)/bahasa/ielts-actions';
import type { ReadingSet } from '@/lib/english/ielts-ai';

/** D-60: IELTS Academic Reading versi pendek. Satu teks, 3 soal TRUE/FALSE/NOT GIVEN dan 3 pilihan ganda. */
export function IeltsReader() {
  const [set, setSet] = useState<ReadingSet | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState<{ band: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showId, setShowId] = useState(true);
  const [busy, start] = useTransition();
  const startedAt = useRef(0);

  const load = () => start(async () => {
    setError(null); setAnswers({}); setChecked(null);
    const r = await newReadingSet();
    if (r.ok) { setSet(r.data); startedAt.current = Date.now(); } else setError(r.message);
  });
   
  useEffect(load, []);

  if (!set) {
    return (
      <div className="card flex flex-col gap-3 p-4">
        <p role="status" className="text-[13px] text-muted">{busy ? 'Ra menyiapkan teks dan soal (sekitar 20 detik)...' : error ?? ''}</p>
        {error && <button type="button" className="btn self-start" onClick={load}>Coba lagi</button>}
      </div>
    );
  }

  const qs = set.questions;
  const correct = qs.filter((q, i) => answers[i] === q.answer).length;
  const check = () => start(async () => {
    setError(null);
    const r = await submitReading({ title: set.title, correct, total: qs.length, seconds: (Date.now() - startedAt.current) / 1000 });
    if (r.ok) setChecked(r.data); else setError(r.message);
  });

  return (
    <div className="flex flex-col gap-4">
      <article className="card flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-[19px] font-extrabold leading-snug" lang="en">{set.title}</h2>
          {checked && set.translation_paragraphs.length > 0 && (
            <button type="button" aria-pressed={showId} onClick={() => setShowId((v) => !v)} className="min-h-11 shrink-0 px-1 text-[13px] font-semibold text-accent-strong">
              {showId ? 'Sembunyikan terjemahan' : 'Tampilkan terjemahan'}
            </button>
          )}
        </div>
        {set.passage.split(/\n+/).filter(Boolean).map((para, i) => (
          <div key={i} className="flex flex-col gap-1">
            <p className="text-[15px] leading-relaxed" lang="en">{para}</p>
            {checked && showId && set.translation_paragraphs[i] && <p className="rounded-xl bg-bg px-3 py-2 text-[13px] leading-relaxed text-muted">{set.translation_paragraphs[i]}</p>}
          </div>
        ))}
        {!checked && <p className="text-[12px] text-muted">Terjemahan bahasa Indonesia muncul setelah jawaban diperiksa.</p>}
      </article>

      <section aria-label="Soal" className="flex flex-col gap-3">
        {qs.map((q, i) => {
          const a = answers[i];
          return (
            <fieldset key={i} className="card flex flex-col gap-2 p-4">
              <legend className="sr-only">Soal {i + 1}</legend>
              <p className="text-[12px] text-muted">{i + 1}. {q.type === 'tfng' ? 'TRUE, FALSE, atau NOT GIVEN' : 'Pilih jawaban yang benar'}</p>
              <p className="text-[15px] font-semibold leading-snug" lang="en">{q.prompt}</p>
              <div className={q.type === 'tfng' ? 'grid grid-cols-3 gap-2' : 'flex flex-col gap-2'}>
                {q.options.map((o) => {
                  const state = !checked ? (a === o ? 'border-accent bg-accent-soft font-semibold text-accent-strong' : 'border-line bg-surface')
                    : o === q.answer ? 'border-2 border-accent bg-accent-soft font-semibold text-accent-strong' : a === o ? 'border-danger-fg/40 bg-danger-bg text-danger-fg' : 'border-line bg-surface text-muted';
                  return (
                    <button key={o} type="button" aria-pressed={a === o} disabled={!!checked} onClick={() => setAnswers((x) => ({ ...x, [i]: o }))}
                      className={`min-h-11 rounded-xl border px-3 text-left text-[13px] ${state}`} lang="en">{o}</button>
                  );
                })}
              </div>
              {checked && <p className="text-[13px] text-muted">{q.explanation_id}</p>}
            </fieldset>
          );
        })}
      </section>

      {checked ? (
        <div role="status" className="card flex flex-col gap-1 p-4">
          <p className="font-display text-[18px] font-extrabold">{correct} dari {qs.length} benar{checked.band != null ? ` · perkiraan band ${checked.band.toLocaleString('id-ID', { minimumFractionDigits: 1 })}` : ''}</p>
          <p className="text-[12px] text-muted">Hanya 6 soal, jadi perkiraan band ini kasar. Tes asli berisi 40 soal dalam 60 menit.</p>
          <button type="button" className="btn mt-2 self-start" disabled={busy} onClick={load}>Teks lain</button>
        </div>
      ) : (
        <button type="button" className="btn btn-primary" disabled={busy || Object.keys(answers).length < qs.length} onClick={check}>
          {Object.keys(answers).length < qs.length ? `Jawab semua soal (${Object.keys(answers).length}/${qs.length})` : 'Periksa jawaban'}
        </button>
      )}
      {error && <p role="alert" className="text-[13px] text-danger-fg">{error}</p>}
    </div>
  );
}
