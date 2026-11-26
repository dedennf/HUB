'use client';
import { Headphones, Play } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { createListening, getListening, submitListening, type ListeningResult, type ListeningView } from '@/app/(dashboard)/bahasa/ielts-actions';

type Recent = { id: string; title: string; section: number; best_score: number | null; attempts: number };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmt = (b: number) => b.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

async function fetchAudio(id: string): Promise<{ url: string | null; error?: string }> {
  try {
    const res = await fetch('/api/english/listening/audio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { url: data.url ?? null } : { url: null, error: data.error ?? `Server menjawab galat ${res.status}.` };
  } catch {
    return { url: null, error: 'Tidak bisa menghubungi server Kompas.' };
  }
}

/**
 * D-65: IELTS Listening versi pendek. Section 1 percakapan, Section 4 ceramah.
 * Mode tes memutar rekaman sekali seperti tes asli, mode latihan boleh diulang.
 * Setelah dinilai, transkrip tampil per kalimat dengan terjemahan bahasa Indonesia.
 */
export function IeltsListener({ recent }: { recent: Recent[] }) {
  const [section, setSection] = useState<1 | 4>(1);
  const [mode, setMode] = useState<'tes' | 'latihan'>('tes');
  const [set, setSet] = useState<ListeningView | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<ListeningResult | null>(null);
  const [played, setPlayed] = useState<'idle' | 'playing' | 'ended'>('idle');
  const [pos, setPos] = useState(0);
  const [showId, setShowId] = useState(true);
  const [busy, start] = useTransition();
  const audio = useRef<HTMLAudioElement>(null);
  const startedAt = useRef(0);

  const open = (id: string, fresh: boolean) => start(async () => {
    setError(null); setResult(null); setAnswers([]); setPlayed('idle'); setPos(0); setSet(null);
    let view = await getListening(id);
    if (!view.ok) { setError(view.message); setStatus(null); return; }
    if (!view.data.audioUrl) {
      setStatus(fresh ? 'Ra merekam suaranya (sekitar 20 sampai 40 detik)...' : 'Membuat ulang audio...');
      const a = await fetchAudio(id);
      if (!a.url) { setError(`${a.error ?? 'Audio tidak bisa dibuat.'} Naskahnya sudah tersimpan, coba lagi dari daftar di bawah.`); setStatus(null); return; }
      view = { ok: true, data: { ...view.data, audioUrl: a.url } };
    }
    setStatus(null);
    setSet(view.data);
    setAnswers(view.data.questions.map(() => ''));
    startedAt.current = Date.now();
  });

  const create = () => start(async () => {
    setError(null); setResult(null); setSet(null);
    setStatus('Ra menulis naskah dan soal (sekitar 15 detik)...');
    const r = await createListening(section);
    if (!r.ok) { setError(r.message); setStatus(null); return; }
    open(r.data.id, true);
  });

  const submit = () => start(async () => {
    if (!set) return;
    setError(null);
    audio.current?.pause();
    const r = await submitListening(set.id, answers, (Date.now() - startedAt.current) / 1000);
    if (r.ok) setResult(r.data); else setError(r.message);
  });

  const playOnce = () => {
    const a = audio.current;
    if (!a || played !== 'idle') return;
    void a.play().then(() => setPlayed('playing')).catch(() => setError('Audio tidak bisa diputar. Cek volume atau izin suara browser.'));
  };

  return (
    <div className="flex flex-col gap-4">
      {!set && (
        <section className="card flex flex-col gap-3 p-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="label">Jenis rekaman</legend>
            <div className="grid grid-cols-2 gap-2">
              {([[1, 'Section 1', 'Percakapan sehari-hari, dua orang'], [4, 'Section 4', 'Ceramah akademik, satu orang']] as const).map(([v, t, d]) => (
                <button key={v} type="button" aria-pressed={section === v} onClick={() => setSection(v)}
                  className={`flex min-h-16 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left ${section === v ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-surface'}`}>
                  <span className="text-[14px] font-semibold">{t}</span><span className="text-[12px] text-muted">{d}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="label">Mode</legend>
            <div className="grid grid-cols-2 gap-2">
              {([['tes', 'Tes', 'Diputar sekali seperti tes asli'], ['latihan', 'Latihan', 'Boleh diputar ulang dan digeser']] as const).map(([v, t, d]) => (
                <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)}
                  className={`flex min-h-16 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left ${mode === v ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-surface'}`}>
                  <span className="text-[14px] font-semibold">{t}</span><span className="text-[12px] text-muted">{d}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={create}>{busy ? 'Menyiapkan...' : 'Buat rekaman baru'}</button>
          {status && <p role="status" className="text-[13px] text-muted">{status}</p>}
          {error && <p role="alert" className="text-[13px] text-danger-fg">{error}</p>}
        </section>
      )}

      {set && (
        <>
          <section className="card flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[12px] text-muted">Section {set.section} · mode {mode}</p>
                <h2 className="font-display text-[18px] font-extrabold leading-snug" lang="en">{set.title}</h2>
              </div>
              <button type="button" className="min-h-11 px-1 text-[13px] font-semibold text-accent-strong" onClick={() => { audio.current?.pause(); setSet(null); setResult(null); }}>Ganti</button>
            </div>
            {mode === 'latihan' || result ? (
              <audio ref={audio} src={set.audioUrl ?? undefined} controls preload="auto" className="w-full" />
            ) : (
              <div className="flex flex-col gap-2">
                <audio ref={audio} src={set.audioUrl ?? undefined} preload="auto" onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)} onEnded={() => setPlayed('ended')} />
                <button type="button" className="btn btn-primary inline-flex items-center justify-center gap-2" disabled={played !== 'idle'} onClick={playOnce}>
                  {played === 'idle' ? <><Play size={18} aria-hidden="true" />Putar rekaman (hanya sekali)</> : played === 'playing' ? <><Headphones size={18} aria-hidden="true" />Sedang diputar... {mmss(pos)}{set.duration ? ` / ${mmss(set.duration)}` : ''}</> : 'Rekaman selesai diputar'}
                </button>
                {set.duration && <div className="h-1.5 rounded-full bg-line" aria-hidden="true"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.min(100, (pos / set.duration) * 100)}%` }} /></div>}
                <p className="text-[12px] text-muted">Baca soal dulu sebelum memutar. Jawab sambil mendengarkan, seperti di tes asli.</p>
              </div>
            )}
          </section>

          <section aria-label="Soal Listening" className="flex flex-col gap-3">
            {set.questions.map((q, i) => {
              const r = result?.items[i];
              return (
                <div key={i} className="card flex flex-col gap-2 p-4">
                  <p className="text-[12px] text-muted">{i + 1}. {q.type === 'gap' ? 'Isi maksimal tiga kata atau satu angka' : 'Pilih jawaban yang benar'}</p>
                  <p className="text-[15px] font-semibold leading-snug" lang="en">{q.prompt}</p>
                  {q.type === 'gap' ? (
                    <label>
                      <span className="sr-only">Jawaban soal {i + 1}</span>
                      <input className="input" lang="en" autoComplete="off" maxLength={60} value={answers[i] ?? ''} disabled={!!result}
                        onChange={(e) => setAnswers((a) => a.map((x, k) => (k === i ? e.target.value : x)))} />
                    </label>
                  ) : (
                    <div className="flex flex-col gap-2" role="group" aria-label={`Pilihan soal ${i + 1}`}>
                      {q.options.map((o) => {
                        const chosen = answers[i] === o;
                        const cls = !result ? (chosen ? 'border-accent bg-accent-soft font-semibold text-accent-strong' : 'border-line bg-surface')
                          : o === r?.answer ? 'border-2 border-accent bg-accent-soft font-semibold text-accent-strong' : chosen ? 'border-danger-fg/40 bg-danger-bg text-danger-fg' : 'border-line bg-surface text-muted';
                        return (
                          <button key={o} type="button" aria-pressed={chosen} disabled={!!result} onClick={() => setAnswers((a) => a.map((x, k) => (k === i ? o : x)))}
                            className={`min-h-11 rounded-xl border px-3 text-left text-[14px] ${cls}`} lang="en">{o}</button>
                        );
                      })}
                    </div>
                  )}
                  {r && (
                    <div className={`rounded-xl px-3 py-2 text-[13px] ${r.ok ? 'bg-accent-soft text-accent-strong' : 'bg-warn-bg text-warn-fg'}`}>
                      <p className="font-semibold">{r.ok ? 'Benar.' : <>Jawaban: <span lang="en">{r.answer}</span>{r.given ? <> · jawabanmu: <span lang="en">{r.given}</span></> : ' · belum dijawab'}</>}</p>
                      <p>{r.explanation_id}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {!result ? (
            <>
              <button type="button" className="btn btn-primary" disabled={busy || (mode === 'tes' && played === 'idle')} onClick={submit}>
                {busy ? 'Menilai...' : mode === 'tes' && played === 'idle' ? 'Putar rekaman dulu' : 'Periksa jawaban'}
              </button>
              {error && <p role="alert" className="text-[13px] text-danger-fg">{error}</p>}
            </>
          ) : (
            <>
              <div role="status" className="card flex flex-col gap-1 p-4">
                <p className="font-display text-[18px] font-extrabold">{result.correct} dari {result.total} benar{result.band != null ? ` · perkiraan band ${fmt(result.band)}` : ''}</p>
                <p className="text-[12px] text-muted">Hanya 6 soal, jadi perkiraan band ini kasar. Tes asli berisi 40 soal dalam 4 section.</p>
              </div>
              <section aria-label="Transkrip dan terjemahan" className="card flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="h-section">Transkrip</h2>
                  <button type="button" aria-pressed={showId} onClick={() => setShowId((v) => !v)} className="min-h-11 px-1 text-[13px] font-semibold text-accent-strong">
                    {showId ? 'Sembunyikan terjemahan' : 'Tampilkan terjemahan'}
                  </button>
                </div>
                <ol className="flex flex-col gap-3">
                  {result.lines.map((l, i) => (
                    <li key={i} className="flex flex-col gap-0.5">
                      {set.section === 1 && <span className="text-[12px] font-semibold text-accent-strong">{l.speaker}</span>}
                      <p className="text-[15px] leading-relaxed" lang="en">{l.text}</p>
                      {showId && <p className="text-[13px] leading-relaxed text-muted">{l.translation_id}</p>}
                    </li>
                  ))}
                </ol>
                <p className="text-[12px] text-muted">Putar lagi rekamannya sambil membaca transkrip untuk melatih telinga.</p>
              </section>
              <button type="button" className="btn" onClick={() => { audio.current?.pause(); setSet(null); setResult(null); }}>Rekaman lain</button>
            </>
          )}
        </>
      )}

      {!set && recent.length > 0 && (
        <section aria-label="Rekaman sebelumnya" className="flex flex-col gap-2">
          <h2 className="h-section">Rekaman sebelumnya</h2>
          <ul className="card rows overflow-hidden">
            {recent.map((r) => (
              <li key={r.id}>
                <button type="button" disabled={busy} onClick={() => open(r.id, false)} className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-bg">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold" lang="en">{r.title}</span>
                    <span className="block text-[12px] text-muted">Section {r.section} · {r.attempts ? `skor terbaik ${r.best_score ?? 0}/6 dari ${r.attempts} percobaan` : 'belum dikerjakan'}</span>
                  </span>
                  <span className="text-[13px] font-semibold text-accent-strong">Buka</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
