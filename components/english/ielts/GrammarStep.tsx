'use client';
import { useEffect, useState, useTransition } from 'react';
import { prepareGrammar, submitGrammar } from '@/app/(dashboard)/bahasa/ielts-actions';
import type { GrammarLesson } from '@/lib/english/ielts-ai';

type Data = { key: string; title: string; level: string; use: string; lesson: GrammarLesson; score: number | null };

/** Langkah 3: satu topik grammar, penjelasan singkat lalu 5 soal dengan pembahasan langsung. */
export function GrammarStep({ onDone }: { onDone: () => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [right, setRight] = useState(0);
  const [finished, setFinished] = useState(false);
  const [busy, start] = useTransition();

  const load = () => start(async () => {
    setError(null);
    const r = await prepareGrammar();
    if (r.ok) setD(r.data); else setError(r.message);
  });
   
  useEffect(load, []);

  if (!d) {
    return (
      <div className="card flex flex-col gap-3 p-4">
        <p role="status" className="text-[13px] text-muted">{busy ? 'Ra menyiapkan materi grammar...' : error ?? ''}</p>
        {error && <button type="button" className="btn self-start" onClick={load}>Coba lagi</button>}
      </div>
    );
  }

  const ex = d.lesson.exercises;
  const q = ex[i];
  const total = ex.length;
  const answer = (opt: string) => {
    if (chosen) return;
    setChosen(opt);
    if (opt === q.answer) setRight((n) => n + 1);
  };
  const next = () => {
    if (i + 1 < total) { setI(i + 1); setChosen(null); return; }
    const score = right;
    start(async () => {
      const r = await submitGrammar(score, total);
      if (r.ok) setFinished(true); else setError(r.message);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-[12px] font-semibold text-accent-strong">Grammar · {d.level} · {d.use}</p>
        <h3 className="font-display text-[20px] font-extrabold leading-tight" lang="en">{d.title}</h3>
      </div>
      <section className="card flex flex-col gap-2 p-4 text-[14px] leading-relaxed">
        <p>{d.lesson.explanation_id}</p>
        {d.lesson.pattern && <p className="rounded-xl bg-bg px-3 py-2 font-semibold" lang="en">{d.lesson.pattern}</p>}
        <ul className="flex flex-col gap-2">
          {d.lesson.examples.map((e) => (
            <li key={e.en} className="rounded-xl bg-bg px-3 py-2">
              <p lang="en">{e.en}</p>
              {e.note_id && <p className="text-[12px] text-muted">{e.note_id}</p>}
            </li>
          ))}
        </ul>
      </section>

      {finished ? (
        <div className="card flex flex-col gap-3 p-4 text-center">
          <p role="status" className="text-[14px] font-semibold">
            Selesai: {right} dari {total} benar. {right / total >= 0.8 ? 'Topik ini dianggap dikuasai.' : 'Topik ini akan muncul lagi supaya makin kuat.'}
          </p>
          <button type="button" className="btn btn-primary" onClick={onDone}>Lanjut ke skill tes</button>
        </div>
      ) : (
        <section aria-label="Latihan grammar" className="flex flex-col gap-2">
          <p className="text-[12px] text-muted">Soal {i + 1} dari {total}</p>
          <p className="text-[15px] font-semibold leading-snug" lang="en">{q.prompt}</p>
          {q.options.map((o) => {
            const state = !chosen ? 'border-line bg-surface'
              : o === q.answer ? 'border-2 border-accent bg-accent-soft text-accent-strong'
              : o === chosen ? 'border-danger-fg/40 bg-danger-bg text-danger-fg' : 'border-line bg-surface text-muted';
            return (
              <button key={o} type="button" disabled={!!chosen} onClick={() => answer(o)} lang="en"
                className={`min-h-12 rounded-xl border px-4 text-left text-[14px] font-semibold ${state}`}>{o}</button>
            );
          })}
          {chosen && (
            <div role="status" className={`rounded-xl px-3 py-2 text-[13px] ${chosen === q.answer ? 'bg-accent-soft text-accent-strong' : 'bg-warn-bg text-warn-fg'}`}>
              <span className="font-semibold">{chosen === q.answer ? 'Benar.' : `Jawaban: ${q.answer}.`}</span> {q.explanation_id}
            </div>
          )}
          {chosen && <button type="button" className="btn btn-primary" disabled={busy} onClick={next}>{i + 1 < total ? 'Soal berikutnya' : busy ? 'Menyimpan...' : 'Selesai'}</button>}
        </section>
      )}
      {error && <p role="alert" className="text-[13px] text-danger-fg">{error}</p>}
    </div>
  );
}
