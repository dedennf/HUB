'use client';
import { useState, useTransition } from 'react';
import { VocabForm } from '@/components/english/VocabForm';
import { StatTile } from '@/components/ui/StatTile';
import type { Correction } from '@/lib/english/ai';
import { correct, newSpeakingQuestion } from '../actions';

const KINDS = [
  { v: 'free', l: 'Bebas' }, { v: 'summary', l: 'Ringkasan jurnal' }, { v: 'abstract', l: 'Draf abstrak' }, { v: 'journal', l: 'Jurnal harian' },
] as const;
const VOCAB_TYPES = new Set(['word choice', 'collocation', 'formality/register', 'spelling']);

/** SPEC 10.2.3: koreksi tulisan. Hasil tersimpan sebagai writing_submissions dan menambah mistake_patterns. */
export function Writer() {
  const [kind, setKind] = useState<string>('free');
  const [prompt, setPrompt] = useState('');
  const [text, setText] = useState('');
  const [res, setRes] = useState<Correction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vocab, setVocab] = useState<{ term: string; context: string } | null>(null);
  const [busy, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 p-4">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="label mb-1">Jenis tulisan</legend>
          {KINDS.map((k) => (
            <label key={k.v} className={`inline-flex min-h-11 cursor-pointer items-center rounded-xl border px-3 text-[13px] ${kind === k.v ? 'border-accent bg-accent-soft font-semibold text-accent-strong' : 'border-line'}`}>
              <input type="radio" name="kind" value={k.v} checked={kind === k.v} onChange={() => setKind(k.v)} className="sr-only" />{k.l}
            </label>
          ))}
        </fieldset>
        {prompt && <p className="rounded-xl bg-bg px-3 py-2 text-[13px]" lang="en"><span className="font-semibold">Topik:</span> {prompt}</p>}
        <label><span className="label">Tulisan bahasa Inggris</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} maxLength={4000} lang="en" className="input min-h-40 py-2" placeholder="Write here..." />
        </label>
        <p className="text-[12px] text-muted">{text.length}/4000 huruf</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" disabled={busy || text.trim().length < 10}
            onClick={() => start(async () => { setError(null); setRes(null); const r = await correct(text, kind, prompt || undefined); if (r.ok) setRes(r.data); else setError(r.message); })}>
            {busy ? 'Ra mengoreksi...' : 'Koreksi'}
          </button>
          <button type="button" className="btn" disabled={busy}
            onClick={() => start(async () => { setError(null); const r = await newSpeakingQuestion(); if (r.ok) setPrompt(r.data.question); else setError(r.message); })}>
            Minta topik dari Ra
          </button>
        </div>
        {error && <p role="alert" className="text-[13px] text-danger-fg">{error}</p>}
      </div>

      {res && (
        <section aria-label="Hasil koreksi" className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2.5">
            <StatTile label="Tata bahasa" value={res.score.grammar} unit="/10" />
            <StatTile label="Kosakata" value={res.score.vocabulary} unit="/10" />
            <StatTile label="Kejelasan" value={res.score.clarity} unit="/10" />
          </div>
          {res.summary_id && <p className="text-[13px]">{res.summary_id}</p>}
          <div className="card p-4">
            <h2 className="h-section mb-1">Versi koreksi</h2>
            <p className="whitespace-pre-line text-[15px] leading-relaxed" lang="en">{res.corrected}</p>
          </div>
          {res.mistakes.length > 0 ? (
            <ul className="card rows overflow-hidden">
              {res.mistakes.map((m, i) => (
                <li key={i} className="px-4 py-3 text-[13px]">
                  <p lang="en"><span className="text-danger-fg line-through">{m.original}</span> → <span className="font-semibold text-positive">{m.fix}</span></p>
                  <p className="text-muted"><span className="font-semibold first-letter:uppercase" lang="en">{m.type}</span>. {m.explanation_id}</p>
                  {VOCAB_TYPES.has(m.type) && (
                    <button type="button" className="mt-1 inline-flex min-h-11 items-center text-[12px] font-semibold text-accent" onClick={() => setVocab({ term: m.fix, context: res.corrected })}>
                      Simpan &ldquo;{m.fix}&rdquo; ke bank kata
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="card px-4 py-3 text-[13px] text-positive">Tidak ada kesalahan penting. Mantap.</p>}
          {vocab && <div className="card p-4"><VocabForm key={vocab.term} compact initial={{ term: vocab.term }} context={vocab.context} source={{ type: 'mistake' }} onSaved={() => setVocab(null)} /></div>}
        </section>
      )}
    </div>
  );
}
