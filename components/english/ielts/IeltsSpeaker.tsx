'use client';
import { Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { newSpeakingPrompt } from '@/app/(dashboard)/bahasa/ielts-actions';
import { RecordingView } from '@/components/ra/RecordingView';
import type { SpeakingAssessment, SpeakingPrompt } from '@/lib/english/ielts-ai';
import { SILENCE_RMS, toGeminiAudio, VoiceRecorder } from '@/lib/voice/recorder';

const MAX: Record<1 | 2 | 3, number> = { 1: 90, 2: 120, 3: 120 };
const CRIT = [
  { k: 'fluency', l: 'Fluency & Coherence' }, { k: 'lexical', l: 'Lexical Resource' },
  { k: 'grammar', l: 'Grammatical Range & Accuracy' }, { k: 'pronunciation', l: 'Pronunciation' },
] as const;
const fmt = (b: number) => b.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function promptText(p: SpeakingPrompt): string {
  if (p.cue) return `${p.cue.topic}\nYou should say:\n${p.cue.points.map((x) => `- ${x}`).join('\n')}\n${p.cue.closing}`;
  return p.questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
}

/** D-60: IELTS Speaking Part 1, 2 (cue card, persiapan 1 menit), atau 3. Dinilai dengan empat kriteria resmi. */
export function IeltsSpeaker({ part }: { part: 1 | 2 | 3 }) {
  const [p, setP] = useState<SpeakingPrompt | null>(null);
  const [prep, setPrep] = useState<number | null>(null);
  const [rec, setRec] = useState<{ seconds: number; levels: number[] } | null>(null);
  const [fb, setFb] = useState<(SpeakingAssessment & { band: number | null }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [busy, start] = useTransition();
  const r = useRef<VoiceRecorder | null>(null);
  const prepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (prepTimer.current) clearInterval(prepTimer.current); }, []);

  const load = () => start(async () => {
    setError(null); setFb(null); setPrep(null);
    const res = await newSpeakingPrompt(part);
    if (res.ok) setP(res.data); else setError(res.message);
  });
   
  useEffect(load, [part]);

  const begin = async () => {
    setError(null); setFb(null);
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) { setError('Browser ini belum bisa merekam suara.'); return; }
    const v = new VoiceRecorder((u) => setRec(u), () => void finish(), MAX[part]);
    r.current = v;
    setRec({ seconds: 0, levels: [] });
    try { await v.start(); } catch (e) {
      r.current = null; setRec(null);
      setError((e as Error).name === 'NotAllowedError' ? 'Izin mikrofon ditolak. Izinkan mikrofon untuk Kompas di pengaturan browser.' : 'Mikrofon tidak bisa dipakai.');
    }
  };

  /** Persiapan Part 2: hitung mundur 60 detik, lalu rekaman mulai sendiri. */
  const startPrep = (seconds = 60) => {
    let left = seconds;
    setPrep(left);
    prepTimer.current = setInterval(() => {
      left -= 1;
      if (left > 0) { setPrep(left); return; }
      skipPrep();
    }, 1000);
  };
  const skipPrep = () => {
    if (prepTimer.current) clearInterval(prepTimer.current);
    prepTimer.current = null;
    setPrep(null);
    void begin();
  };

  const finish = async () => {
    const v = r.current;
    if (!v || !p) return;
    r.current = null;
    setRec(null);
    const out = await v.stop();
    if (!out || out.seconds < 5) { setError('Rekamannya terlalu pendek. Jawab minimal beberapa kalimat.'); return; }
    if (out.peak >= 0 && out.peak < SILENCE_RMS) { setError('Tidak ada suara yang terdengar. Cek mikrofon lalu coba lagi.'); return; }
    setSending(true);
    try {
      const audio = await toGeminiAudio(out.blob);
      const fd = new FormData();
      fd.set('audio', new File([audio.blob], 'jawaban', { type: audio.mime }));
      fd.set('prompt', promptText(p));
      fd.set('part', String(part));
      fd.set('seconds', String(out.seconds));
      const res = await fetch('/api/english/ielts-speaking', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? `Server menjawab galat ${res.status}.`); else setFb(data);
    } catch {
      setError('Tidak bisa menghubungi server Kompas.');
    } finally {
      setSending(false);
    }
  };

  const idle = !rec && prep == null && !sending;
  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] text-muted">Speaking Part {part} · {part === 1 ? 'jawab ketiga pertanyaan berurutan, sekitar 1 menit' : part === 2 ? 'persiapan 1 menit, bicara sampai 2 menit' : 'jawab dengan alasan dan contoh, sekitar 2 menit'}</p>
          <button type="button" className="min-h-11 px-1 text-[13px] font-semibold text-accent-strong disabled:opacity-50" disabled={busy || !idle} onClick={load}>Soal lain</button>
        </div>
        {!p ? <p role="status" className="text-[13px] text-muted">{busy ? 'Ra menyiapkan soal...' : ''}</p> : p.cue ? (
          <div className="rounded-2xl bg-bg p-4" lang="en">
            <p className="font-display text-[18px] font-bold leading-snug">{p.cue.topic}</p>
            <p className="mt-2 text-[13px] text-muted">You should say:</p>
            <ul className="list-disc pl-5 text-[14px] leading-relaxed">{p.cue.points.map((x) => <li key={x}>{x}</li>)}</ul>
            <p className="text-[14px]">{p.cue.closing}</p>
          </div>
        ) : (
          <ol className="list-decimal pl-5 text-[16px] font-semibold leading-relaxed" lang="en">{p.questions.map((q) => <li key={q}>{q}</li>)}</ol>
        )}
      </section>

      {p && idle && (
        <button type="button" className="btn btn-primary inline-flex items-center justify-center gap-2" onClick={() => (part === 2 ? startPrep() : void begin())}>
          <Mic size={18} aria-hidden="true" />{part === 2 ? 'Mulai persiapan 1 menit' : fb ? 'Jawab lagi' : 'Mulai menjawab'}
        </button>
      )}
      {prep != null && (
        <div className="card flex flex-col items-center gap-2 p-4" role="timer" aria-live="off">
          <p className="text-[13px] text-muted">Persiapan. Buat catatan kecil, rekaman mulai otomatis.</p>
          <p className="num font-display text-[40px] font-extrabold">{mmss(prep)}</p>
          <button type="button" className="btn" onClick={skipPrep}>Langsung bicara</button>
        </div>
      )}
      {rec && (
        <div className="card">
          <RecordingView seconds={rec.seconds} levels={rec.levels.length ? rec.levels : Array(16).fill(0.1)} hint={`Tekan Selesai bila sudah · berhenti otomatis di ${mmss(MAX[part])}`} />
          <div className="p-4">
            <button type="button" onClick={() => void finish()} className="btn btn-primary inline-flex w-full items-center justify-center gap-2"><Square size={16} aria-hidden="true" />Selesai, nilai jawaban</button>
          </div>
        </div>
      )}
      {sending && <p role="status" className="text-[13px] text-muted">Ra mendengarkan dan menilai jawabanmu...</p>}
      {error && <p role="alert" className="text-[13px] text-danger-fg">{error}</p>}

      {fb && (
        <section aria-label="Penilaian IELTS Speaking" className="flex flex-col gap-3">
          {fb.bands && fb.band != null && (
            <div className="card p-4">
              <div className="flex items-baseline justify-between gap-2 pb-1">
                <span className="text-[13px] text-muted">Perkiraan band Speaking</span>
                <span className="font-display text-[32px] font-extrabold leading-none">{fmt(fb.band)}</span>
              </div>
              <ul className="rows mt-2">
                {CRIT.map((c) => (
                  <li key={c.k} className="grid grid-cols-[minmax(0,1fr)_40px] gap-2 py-2.5">
                    <span>
                      <span className="block text-[13px] font-semibold" lang="en">{c.l}</span>
                      {fb.notes && <span className="block text-[12px] text-muted">{fb.notes[c.k]}</span>}
                    </span>
                    <span className="num text-right font-display text-[18px] font-extrabold">{fmt(fb.bands![c.k])}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {fb.summary_id && <p className="text-[14px]">{fb.summary_id}</p>}
          <div className="card flex flex-col gap-2 p-4 text-[14px]">
            <h2 className="h-section">Yang Ra dengar</h2>
            <p className="italic" lang="en">&ldquo;{fb.transcript}&rdquo;</p>
          </div>
          {fb.better && (
            <div className="card flex flex-col gap-1 p-4">
              <h2 className="h-section">Contoh jawaban band 7</h2>
              <p className="text-[14px] leading-relaxed" lang="en">{fb.better}</p>
            </div>
          )}
          {fb.mistakes.length > 0 && (
            <ul className="card rows overflow-hidden text-[13px]">
              {fb.mistakes.map((m, i) => (
                <li key={i} className="px-4 py-2.5"><p lang="en"><span className="line-through">{m.original}</span> → <span className="font-semibold">{m.fix}</span></p><p className="text-muted">{m.explanation_id}</p></li>
              ))}
            </ul>
          )}
          <p className="text-[12px] text-muted">Pronunciation dari rekaman hanya gambaran kasar. Semua skor perkiraan, bukan skor resmi. Rekaman tidak disimpan.</p>
        </section>
      )}
    </div>
  );
}
