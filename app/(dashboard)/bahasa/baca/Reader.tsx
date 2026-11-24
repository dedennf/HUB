'use client';
import { BookmarkPlus, Scissors, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { VocabForm } from '@/components/english/VocabForm';
import type { Explanation } from '@/lib/english/ai';
import { sentenceAround } from '@/lib/english/text';
import { explain, finishReading, saveReadingText } from '../actions';

type Sel = { text: string; context: string };

/** Membaca berpendamping (SPEC 10.2.2): blok kata atau kalimat lalu Jelaskan, Pecah kalimat, atau Simpan kata. */
export function Reader({ readingId, title, initialText }: { readingId?: string; title?: string; initialText: string }) {
  const [text, setText] = useState(initialText);
  const [editing, setEditing] = useState(!initialText);
  const [sel, setSel] = useState<Sel | null>(null);
  const [result, setResult] = useState<{ mode: 'explain' | 'breakdown'; sel: Sel; data: Explanation } | null>(null);
  const [saveFor, setSaveFor] = useState<{ term: string; context: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [busy, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  // waktu mulai membaca, diisi saat event (bukan saat render)
  const opened = useRef(0);
  useEffect(() => { opened.current = Date.now(); }, []);

  const readSelection = useCallback(() => {
    const s = window.getSelection();
    const box = ref.current;
    if (!s || s.isCollapsed || !box || !box.contains(s.anchorNode) || !box.contains(s.focusNode)) return;
    const picked = s.toString().replace(/\s+/g, ' ').trim();
    if (!picked || picked.length > 1500) return;
    // posisi di teks asli: cari kemunculan potongan di sekitar paragraf yang dipilih
    const idx = text.indexOf(picked);
    setSel({ text: picked, context: idx >= 0 ? sentenceAround(text, idx, idx + picked.length) : picked });
  }, [text]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const on = () => { clearTimeout(t); t = setTimeout(readSelection, 250); };
    document.addEventListener('selectionchange', on);
    return () => { document.removeEventListener('selectionchange', on); clearTimeout(t); };
  }, [readSelection]);

  const run = (mode: 'explain' | 'breakdown') => {
    if (!sel) return;
    const s = sel;
    start(async () => {
      setError(null); setResult(null); setSaveFor(null);
      const r = await explain(s.text, s.context === s.text ? undefined : s.context, mode === 'breakdown');
      if (r.ok) setResult({ mode, sel: s, data: r.data }); else setError(r.message);
    });
  };

  if (editing) {
    return (
      <div className="card flex flex-col gap-3 p-4">
        <label><span className="label">Tempel teks bahasa Inggris (abstrak, paragraf jurnal, artikel)</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} maxLength={20000} lang="en" className="input min-h-48 py-2" />
        </label>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={() => { setEditing(false); opened.current = Date.now(); }}>Mulai membaca</button>
          {readingId && <button type="button" className="btn" disabled={!text.trim() || busy} onClick={() => start(async () => { const r = await saveReadingText(readingId, text); setError(r.ok ? null : r.message); if (r.ok) setEditing(false); })}>Simpan ke bacaan ini</button>}
        </div>
        {error && <p role="alert" className="text-[13px] text-danger-fg">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-28">
      <article ref={ref} lang="en" aria-label={title ?? 'Teks bacaan'} className="card select-text p-4 text-[16px] leading-[1.75]">
        {text.split(/\n{2,}/).map((p, i) => <p key={i} className="mb-3 whitespace-pre-line last:mb-0">{p}</p>)}
      </article>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn" onClick={() => setEditing(true)}>Ganti teks</button>
        <button type="button" className="btn" onClick={() => { void finishReading((Date.now() - opened.current) / 1000, saved.length); setError(null); setResult(null); setSaveFor(null); setSel(null); alert(`Sesi membaca tercatat${saved.length ? `, ${saved.length} kata disimpan` : ''}.`); }}>Selesai membaca</button>
      </div>
      <p className="text-[12px] text-muted">Blok kata atau kalimat untuk dijelaskan Ra. Di HP, tekan lama lalu geser penanda.</p>

      {(result || saveFor || error || busy) && (
        <section aria-live="polite" aria-label="Penjelasan Ra" className="card relative flex flex-col gap-2 p-4">
          <button type="button" aria-label="Tutup penjelasan" className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center text-muted" onClick={() => { setResult(null); setSaveFor(null); setError(null); }}>
            <X size={18} aria-hidden="true" />
          </button>
          {busy && <p role="status" className="text-[13px] text-muted">Ra membaca...</p>}
          {error && <p role="alert" className="text-[13px] text-danger-fg">{error}</p>}
          {result && (
            <>
              <p className="pr-10 text-[13px] font-semibold italic" lang="en">&ldquo;{result.sel.text}&rdquo;</p>
              <p className="text-[14px]">{result.data.translation_id}</p>
              {result.data.explanation_id && <p className="text-[13px] text-muted">{result.data.explanation_id}</p>}
              {result.mode === 'breakdown' && result.data.parts.length > 0 && (
                <ol className="flex flex-col gap-2">
                  {result.data.parts.map((p, i) => (
                    <li key={i} className="rounded-xl bg-bg px-3 py-2 text-[13px]">
                      <span className="block font-semibold" lang="en">{p.text}</span>
                      <span className="block">{p.translation_id}</span>
                      <span className="block text-[12px] text-muted">{p.grammar_id}</span>
                    </li>
                  ))}
                </ol>
              )}
              {result.data.vocab.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {result.data.vocab.map((v) => (
                    <button key={v.term} type="button" disabled={saved.includes(v.term)} onClick={() => setSaveFor({ term: v.term, context: result.sel.context })}
                      className="min-h-11 rounded-xl border border-line px-3 text-left text-[12px] hover:border-accent disabled:opacity-50">
                      <span className="font-semibold" lang="en">{v.term}</span> · {v.meaning_id}{saved.includes(v.term) ? ' ✓' : ' +'}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {saveFor && (
            <div className="mt-1 border-t border-line pt-3">
              <VocabForm key={saveFor.term} compact initial={{ term: saveFor.term, example: saveFor.context }} context={saveFor.context}
                source={{ type: 'reading', ref: readingId }} onSaved={(t) => { setSaved((s) => [...s, saveFor.term, t]); setSaveFor(null); }} />
            </div>
          )}
        </section>
      )}

      {sel && (
        <div role="toolbar" aria-label="Aksi untuk teks terpilih" className="fixed inset-x-4 bottom-24 z-30 mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-line bg-surface p-2 shadow-lg lg:bottom-6">
          <span className="min-w-0 flex-1 truncate px-2 text-[12px] italic text-muted" lang="en">{sel.text}</span>
          <button type="button" disabled={busy} onClick={() => run('explain')} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-[12px] font-semibold text-accent"><Sparkles size={16} aria-hidden="true" />Jelaskan</button>
          {sel.text.split(' ').length > 6 && <button type="button" disabled={busy} onClick={() => run('breakdown')} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-[12px] font-semibold text-accent"><Scissors size={16} aria-hidden="true" />Pecah</button>}
          {sel.text.split(' ').length <= 4 && <button type="button" onClick={() => { setResult(null); setSaveFor({ term: sel.text, context: sel.context }); }} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-[12px] font-semibold text-accent"><BookmarkPlus size={16} aria-hidden="true" />Simpan</button>}
          <button type="button" aria-label="Batal pilih" onClick={() => { setSel(null); window.getSelection()?.removeAllRanges(); }} className="inline-flex h-11 w-11 items-center justify-center text-muted"><X size={16} aria-hidden="true" /></button>
        </div>
      )}
    </div>
  );
}
