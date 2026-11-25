'use client';
import { useEffect, useState, useTransition } from 'react';
import { checkWordSentence, learnWords, prepareWords } from '@/app/(dashboard)/bahasa/ielts-actions';
import type { DailyWord, SentenceCheck } from '@/lib/english/ielts-ai';

/** Langkah 2: 5 kata akademik baru. Pengguna menulis satu kalimat dengan salah satunya, lalu menyimpan semuanya ke bank kata. */
export function WordsStep({ onDone }: { onDone: () => void }) {
  const [words, setWords] = useState<DailyWord[] | null>(null);
  const [learned, setLearned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState(0);
  const [sentence, setSentence] = useState('');
  const [check, setCheck] = useState<SentenceCheck | null>(null);
  const [busy, start] = useTransition();

  const load = () => start(async () => {
    setError(null);
    const r = await prepareWords();
    if (r.ok) { setWords(r.data.words); setLearned(r.data.learned); } else setError(r.message);
  });
   
  useEffect(load, []);

  if (!words) {
    return (
      <div className="card flex flex-col gap-3 p-4">
        <p role="status" className="text-[13px] text-muted">{busy ? 'Ra memilih 5 kata akademik untukmu...' : error ?? ''}</p>
        {error && <button type="button" className="btn self-start" onClick={load}>Coba lagi</button>}
      </div>
    );
  }

  const w = words[pick];
  return (
    <div className="flex flex-col gap-3">
      <ul className="card rows overflow-hidden">
        {words.map((x, i) => (
          <li key={x.term} className="flex flex-col gap-1 px-4 py-3">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-display text-[18px] font-extrabold" lang="en">{x.term}</span>
              {x.part_of_speech && <span className="text-[12px] text-muted" lang="en">{x.part_of_speech}</span>}
              <span className="text-[14px]">{x.meaning_id}</span>
            </p>
            {x.collocations.length > 0 && <p className="text-[12px] text-muted" lang="en">{x.collocations.join(' · ')}</p>}
            {x.example && <p className="text-[13px] italic" lang="en">&ldquo;{x.example}&rdquo;</p>}
            <span className="sr-only">Kata {i + 1} dari {words.length}</span>
          </li>
        ))}
      </ul>

      <div className="card flex flex-col gap-3 p-4">
        <h3 className="h-section">Pakai dalam kalimatmu sendiri</h3>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Pilih kata">
          {words.map((x, i) => (
            <button key={x.term} type="button" aria-pressed={pick === i} onClick={() => { setPick(i); setCheck(null); }}
              className={`min-h-11 rounded-xl border px-3 text-[13px] ${pick === i ? 'border-accent bg-accent-soft font-semibold text-accent-strong' : 'border-line'}`} lang="en">{x.term}</button>
          ))}
        </div>
        <label><span className="label">Kalimat dengan &ldquo;{w.term}&rdquo;</span>
          <textarea value={sentence} onChange={(e) => setSentence(e.target.value)} rows={2} maxLength={400} lang="en" className="input min-h-20 py-2" placeholder="Write one sentence..." />
        </label>
        <button type="button" className="btn self-start" disabled={busy || sentence.trim().length < 10}
          onClick={() => start(async () => { setError(null); const r = await checkWordSentence(w.term, sentence); if (r.ok) setCheck(r.data); else setError(r.message); })}>
          {busy ? 'Ra memeriksa...' : 'Periksa kalimat'}
        </button>
        {check && (
          <div role="status" className={`rounded-xl px-3 py-2 text-[13px] ${check.correct ? 'bg-accent-soft text-accent-strong' : 'bg-warn-bg text-warn-fg'}`}>
            <p className="font-semibold">{check.correct ? 'Sudah tepat.' : 'Hampir.'} {check.explanation_id}</p>
            {check.corrected && <p className="mt-1" lang="en">{check.corrected}</p>}
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-[13px] text-danger-fg">{error}</p>}
      <button type="button" className="btn btn-primary" disabled={busy || learned}
        onClick={() => start(async () => { const r = await learnWords(); if (r.ok) { setLearned(true); onDone(); } else setError(r.message); })}>
        {learned ? 'Sudah masuk bank kata' : 'Simpan 5 kata ke review, lanjut'}
      </button>
    </div>
  );
}
