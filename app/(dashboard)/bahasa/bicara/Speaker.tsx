'use client';
import { Mic, Square } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { RecordingView } from '@/components/ra/RecordingView';
import { StatTile } from '@/components/ui/StatTile';
import type { SpeakingFeedback } from '@/lib/english/ai';
import { SILENCE_RMS, toGeminiAudio, VoiceRecorder } from '@/lib/voice/recorder';
import { newSpeakingQuestion } from '../actions';

const TOPICS = ['Kuliah', 'Riset', 'Presentasi', 'Wawancara kerja'];

/** SPEC 10.2.4 tingkat 1: Ra bertanya, pengguna menjawab lisan, Gemini menilai rekamannya. */
export function Speaker() {
  const [q, setQ] = useState<{ question: string; hint_id: string } | null>(null);
  const [rec, setRec] = useState<{ seconds: number; levels: number[] } | null>(null);
  const [fb, setFb] = useState<SpeakingFeedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [sending, setSending] = useState(false);
  const r = useRef<VoiceRecorder | null>(null);

  const ask = (topic?: string) => start(async () => {
    setError(null); setFb(null);
    const res = await newSpeakingQuestion(topic);
    if (res.ok) setQ(res.data); else setError(res.message);
  });

  const begin = async () => {
    setError(null); setFb(null);
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) { setError('Browser ini belum bisa merekam suara.'); return; }
    const v = new VoiceRecorder((u) => setRec(u), () => void finish());
    r.current = v;
    setRec({ seconds: 0, levels: [] });
    try { await v.start(); } catch (e) {
      r.current = null; setRec(null);
      setError((e as Error).name === 'NotAllowedError' ? 'Izin mikrofon ditolak. Izinkan mikrofon untuk Kompas di pengaturan browser.' : 'Mikrofon tidak bisa dipakai.');
    }
  };

  const finish = async () => {
    const v = r.current;
    if (!v || !q) return;
    r.current = null;
    setRec(null);
    const out = await v.stop();
    if (!out || out.seconds < 2) { setError('Rekamannya terlalu pendek. Jawab minimal beberapa kalimat.'); return; }
    if (out.peak >= 0 && out.peak < SILENCE_RMS) { setError('Tidak ada suara yang terdengar. Cek mikrofon lalu coba lagi.'); return; }
    setSending(true);
    try {
      const audio = await toGeminiAudio(out.blob);
      const fd = new FormData();
      fd.set('audio', new File([audio.blob], 'jawaban', { type: audio.mime }));
      fd.set('question', q.question);
      fd.set('seconds', String(out.seconds));
      const res = await fetch('/api/english/speaking', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? `Server menjawab galat ${res.status}.`); else setFb(data as SpeakingFeedback);
    } catch {
      setError('Tidak bisa menghubungi server Kompas.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 p-4">
        {q ? (
          <>
            <p className="font-display text-[18px] font-bold leading-snug" lang="en">{q.question}</p>
            {q.hint_id && <p className="text-[13px] text-muted">{q.hint_id}</p>}
          </>
        ) : <p className="text-[14px] text-muted">Pilih topik, Ra memberi satu pertanyaan untuk dijawab lisan 30 sampai 60 detik.</p>}
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t) => <button key={t} type="button" disabled={busy || !!rec || sending} onClick={() => ask(t)} className="min-h-11 rounded-xl border border-line px-3 text-[13px] hover:border-accent">{t}</button>)}
          <button type="button" disabled={busy || !!rec || sending} onClick={() => ask()} className="min-h-11 rounded-xl border border-line px-3 text-[13px] hover:border-accent">Acak</button>
        </div>
        {busy && <p role="status" className="text-[13px] text-muted">Ra menyiapkan pertanyaan...</p>}
      </div>

      {q && !rec && (
        <button type="button" onClick={begin} disabled={sending} className="btn btn-primary inline-flex items-center justify-center gap-2">
          <Mic size={18} aria-hidden="true" />{sending ? 'Ra menilai jawabanmu...' : fb ? 'Jawab lagi' : 'Mulai menjawab'}
        </button>
      )}
      {rec && (
        <div className="card">
          <RecordingView seconds={rec.seconds} levels={rec.levels.length ? rec.levels : Array(16).fill(0.1)} />
          <div className="px-4 pb-4">
            <button type="button" onClick={() => void finish()} className="btn btn-primary inline-flex w-full items-center justify-center gap-2"><Square size={16} aria-hidden="true" />Selesai, nilai jawaban</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-[13px] text-danger-fg">{error}</p>}

      {fb && (
        <section aria-label="Penilaian jawaban" className="flex flex-col gap-3">
          {fb.score && (
            <div className="grid grid-cols-4 gap-2">
              <StatTile label="Isi" value={fb.score.content} />
              <StatTile label="Tata bahasa" value={fb.score.grammar} />
              <StatTile label="Kosakata" value={fb.score.vocabulary} />
              <StatTile label="Kelancaran" value={fb.score.fluency} />
            </div>
          )}
          <div className="card flex flex-col gap-2 p-4 text-[14px]">
            <h2 className="h-section">Yang Ra dengar</h2>
            <p className="italic" lang="en">&ldquo;{fb.transcript}&rdquo;</p>
            {fb.content_id && <p className="text-[13px]">{fb.content_id}</p>}
          </div>
          {fb.natural_version && (
            <div className="card flex flex-col gap-1 p-4">
              <h2 className="h-section">Versi yang lebih natural</h2>
              <p className="text-[15px] leading-relaxed" lang="en">{fb.natural_version}</p>
            </div>
          )}
          {(fb.grammar.length > 0 || fb.word_choice.length > 0) && (
            <ul className="card rows overflow-hidden text-[13px]">
              {fb.grammar.map((m, i) => (
                <li key={`g${i}`} className="px-4 py-2.5"><p lang="en"><span className="line-through">{m.original}</span> → <span className="font-semibold">{m.fix}</span></p><p className="text-muted">{m.explanation_id}</p></li>
              ))}
              {fb.word_choice.map((m, i) => (
                <li key={`w${i}`} className="px-4 py-2.5"><p lang="en">{m.original} → <span className="font-semibold">{m.better}</span></p><p className="text-muted">{m.explanation_id}</p></li>
              ))}
            </ul>
          )}
          {fb.pronunciation_id && <p className="text-[13px]"><span className="font-semibold">Pelafalan:</span> {fb.pronunciation_id}</p>}
          <p className="text-[12px] text-muted">Catatan: penilaian pelafalan dari rekaman bersifat kasar, anggap sebagai gambaran umum, bukan skor resmi.</p>
        </section>
      )}
    </div>
  );
}
