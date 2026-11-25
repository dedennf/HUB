'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { newWritingPrompt, submitWriting, type WritingResult } from '@/app/(dashboard)/bahasa/ielts-actions';
import type { WritingPrompt } from '@/lib/english/ielts-ai';

const CRIT = [
  { k: 'task', t1: 'Task Achievement', t2: 'Task Response' },
  { k: 'coherence', t1: 'Coherence & Cohesion', t2: 'Coherence & Cohesion' },
  { k: 'lexical', t1: 'Lexical Resource', t2: 'Lexical Resource' },
  { k: 'grammar', t1: 'Grammatical Range & Accuracy', t2: 'Grammatical Range & Accuracy' },
] as const;
const fmt = (b: number) => b.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** D-60: IELTS Academic Writing Task 1 (tabel) atau Task 2 (esai), dinilai dengan empat kriteria resmi, lalu bisa direvisi. */
export function IeltsWriter({ task }: { task: 1 | 2 }) {
  const [prompt, setPrompt] = useState<WritingPrompt | null>(null);
  const [text, setText] = useState('');
  const [res, setRes] = useState<WritingResult | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const startedAt = useRef<number | null>(null);
  const min = task === 1 ? 150 : 250;
  const words = text.split(/\s+/).filter(Boolean).length;

  const load = () => start(async () => {
    setError(null); setRes(null); setHistory([]); setText(''); startedAt.current = null;
    const r = await newWritingPrompt(task);
    if (r.ok) setPrompt(r.data); else setError(r.message);
  });
   
  useEffect(load, [task]);

  const submit = () => start(async () => {
    if (!prompt) return;
    setError(null);
    const r = await submitWriting({
      task, question: prompt.question, table: prompt.task === 1 ? prompt.table : null, text,
      revisionOf: res?.id ?? null, seconds: startedAt.current ? (Date.now() - startedAt.current) / 1000 : undefined,
    });
    if (!r.ok) { setError(r.message); return; }
    setHistory((h) => (res ? [...h, res.band] : h));
    setRes(r.data);
  });

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] text-muted">Writing Task {task} · minimal {min} kata · {task === 1 ? 'sekitar 20 menit' : 'sekitar 40 menit'} di tes asli</p>
          <button type="button" className="min-h-11 px-1 text-[13px] font-semibold text-accent-strong disabled:opacity-50" disabled={busy} onClick={load}>Soal lain</button>
        </div>
        {!prompt ? <p role="status" className="text-[13px] text-muted">{busy ? 'Ra menyiapkan soal...' : ''}</p> : (
          <>
            <p className="whitespace-pre-line text-[15px] leading-relaxed" lang="en">{prompt.question}</p>
            {prompt.task === 1 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]" lang="en">
                  <caption className="pb-1 text-left font-semibold">{prompt.table.title}{prompt.table.unit ? ` (${prompt.table.unit})` : ''}</caption>
                  <thead><tr>{prompt.table.columns.map((c, i) => <th key={i} className={`border-b border-line px-2 py-1.5 ${i ? 'text-right' : 'text-left'}`}>{c}</th>)}</tr></thead>
                  <tbody>
                    {prompt.table.rows.map((r) => (
                      <tr key={r.label}>
                        <th scope="row" className="border-b border-line px-2 py-1.5 text-left font-medium">{r.label}</th>
                        {r.values.map((v, i) => <td key={i} className="num border-b border-line px-2 py-1.5 text-right">{v.toLocaleString('en-GB')}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {prompt && (
        <section className="card flex flex-col gap-3 p-4">
          <label><span className="label">{res ? 'Revisi jawabanmu' : 'Jawabanmu'}</span>
            <textarea value={text} onChange={(e) => { startedAt.current ??= Date.now(); setText(e.target.value); }} rows={12} maxLength={8000} lang="en" className="input min-h-64 py-2" placeholder="Write your answer here..." />
          </label>
          <p className={`text-[12px] ${words < min ? 'text-warn-fg' : 'text-positive'}`}>{words} kata{words < min ? `, kurang ${min - words} dari minimal` : ''}</p>
          <button type="button" className="btn btn-primary" disabled={busy || words < 30} onClick={submit}>
            {busy && text ? 'Ra menilai tulisanmu...' : res ? 'Nilai revisi' : 'Nilai dengan kriteria IELTS'}
          </button>
          {error && <p role="alert" className="text-[13px] text-danger-fg">{error}</p>}
        </section>
      )}

      {res && (
        <section aria-label="Penilaian IELTS" className="flex flex-col gap-3">
          <div className="card p-4">
            <div className="flex items-baseline justify-between gap-2 pb-1">
              <span className="text-[13px] text-muted">Perkiraan band Task {task}</span>
              <span className="font-display text-[32px] font-extrabold leading-none">{fmt(res.band)}</span>
            </div>
            {history.length > 0 && <p className="text-[12px] text-muted">Sebelumnya: {history.map(fmt).join(' → ')} → {fmt(res.band)}</p>}
            <ul className="rows mt-2">
              {CRIT.map((c) => (
                <li key={c.k} className="grid grid-cols-[minmax(0,1fr)_40px] gap-2 py-2.5">
                  <span>
                    <span className="block text-[13px] font-semibold" lang="en">{task === 1 ? c.t1 : c.t2}</span>
                    <span className="block text-[12px] text-muted">{res.notes[c.k]}</span>
                  </span>
                  <span className="num text-right font-display text-[18px] font-extrabold">{fmt(res.bands[c.k])}</span>
                </li>
              ))}
            </ul>
          </div>
          {res.summary_id && <p className="text-[14px]">{res.summary_id}</p>}
          {res.improved && (
            <div className="card flex flex-col gap-1 p-4">
              <h2 className="h-section">Contoh kalimat versi band 7</h2>
              <p className="whitespace-pre-line text-[14px] leading-relaxed" lang="en">{res.improved}</p>
            </div>
          )}
          {res.mistakes.length > 0 && (
            <ul className="card rows overflow-hidden">
              {res.mistakes.map((m, i) => (
                <li key={i} className="px-4 py-3 text-[13px]">
                  <p lang="en"><span className="text-danger-fg line-through">{m.original}</span> → <span className="font-semibold text-positive">{m.fix}</span></p>
                  <p className="text-muted"><span className="font-semibold first-letter:uppercase" lang="en">{m.type}</span>. {m.explanation_id}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[12px] text-muted">Dinilai Gemini dengan public band descriptors IELTS. Perkiraan, bukan skor resmi. Perbaiki tulisan di atas lalu tekan &ldquo;Nilai revisi&rdquo;.</p>
        </section>
      )}
    </div>
  );
}
