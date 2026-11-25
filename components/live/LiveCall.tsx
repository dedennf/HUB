'use client';
import type { LiveServerMessage, Session } from '@google/genai';
import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProposalCard, type ChipEdit } from '@/components/ra/ProposalCard';
import { RaAvatar } from '@/components/ra/RaMark';
import type { CardView, Lookups } from '@/lib/agent/cards';
import { confirmActions } from '@/lib/agent/client';
import { MicStream, PcmPlayer, rateOf } from '@/lib/live/audio';
import { VoiceOrb, type OrbMode } from './VoiceOrb';

type Status = 'idle' | 'connecting' | 'listening' | 'speaking' | 'ended' | 'error';
type Turn = { role: 'user' | 'model'; text: string };
const LABEL: Record<Status, string> = {
  idle: 'Siap', connecting: 'Menyambung ke Ra...', listening: 'Ra mendengarkan', speaking: 'Ra berbicara', ended: 'Percakapan selesai', error: 'Terputus',
};

/**
 * Percakapan suara dua arah lewat Gemini Live (SPEC 7.3 tingkat 2). Klien tersambung langsung ke Gemini dengan
 * token sementara dari server. Tool baca dijalankan server, tool tulis menjadi kartu yang dikonfirmasi di layar.
 */
export function LiveCall({ mode = 'assistant', topic, onClose }: { mode?: 'assistant' | 'english'; topic?: string; onClose?: () => void }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [cards, setCards] = useState<{ card: CardView; state: 'pending' | 'approved' | 'rejected' }[]>([]);
  const [lookups, setLookups] = useState<Lookups | undefined>();
  const [edits, setEdits] = useState<Record<string, Record<string, ChipEdit>>>({});
  const [muted, setMuted] = useState(false);
  const micLevel = useRef(0);
  const session = useRef<Session | null>(null);
  const mic = useRef<MicStream | null>(null);
  const player = useRef<PcmPlayer | null>(null);
  const conv = useRef<string | null>(null);
  const started = useRef(0);
  const turnsRef = useRef<Turn[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { turnsRef.current = turns; endRef.current?.scrollIntoView({ block: 'end' }); }, [turns, cards.length]);

  /** Tambah potongan transkrip ke giliran yang sedang berjalan, atau mulai giliran baru. */
  const append = useCallback((role: Turn['role'], text: string) => {
    if (!text) return;
    setTurns((t) => {
      const last = t.at(-1);
      if (last && last.role === role) return [...t.slice(0, -1), { role, text: last.text + text }];
      return [...t, { role, text: text.trimStart() }];
    });
  }, []);

  const finish = useCallback(async (reason?: string) => {
    mic.current?.stop(); mic.current = null;
    player.current?.close(); player.current = null;
    const s = session.current; session.current = null;
    try { s?.close(); } catch { /* sudah tertutup */ }
    if (reason) setError(reason);
    setStatus((st) => (st === 'error' ? st : 'ended'));
    if (conv.current) {
      const id = conv.current; conv.current = null;
      await fetch('/api/live/end', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: id, mode, seconds: started.current ? (Date.now() - started.current) / 1000 : 0, turns: turnsRef.current.slice(-200) }),
      }).catch(() => {});
    }
  }, [mode]);

  useEffect(() => () => { void finish(); }, [finish]);

  const onTool = useCallback(async (calls: NonNullable<LiveServerMessage['toolCall']>['functionCalls']) => {
    const responses = [];
    for (const c of calls ?? []) {
      let response: Record<string, unknown> = { error: 'Tool gagal dijalankan.' };
      try {
        const res = await fetch('/api/live/tool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: c.name, args: c.args ?? {}, conversation_id: conv.current }) });
        const data = await res.json();
        if (data.response) response = data.response;
        if (data.card) { setCards((x) => [...x, { card: data.card, state: 'pending' }]); setLookups(data.lookups); }
      } catch { /* jawaban galat dikirim ke model */ }
      responses.push({ id: c.id, name: c.name, response });
    }
    session.current?.sendToolResponse({ functionResponses: responses });
  }, []);

  const onMessage = useCallback((m: LiveServerMessage) => {
    const sc = m.serverContent;
    if (sc?.interrupted) player.current?.interrupt();
    if (sc?.inputTranscription?.text) append('user', sc.inputTranscription.text);
    if (sc?.outputTranscription?.text) append('model', sc.outputTranscription.text);
    for (const part of sc?.modelTurn?.parts ?? []) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/')) player.current?.play(part.inlineData.data, rateOf(part.inlineData.mimeType));
    }
    if (m.toolCall?.functionCalls?.length) void onTool(m.toolCall.functionCalls);
    if (m.goAway) setError('Sesi akan segera berakhir. Mulai lagi bila perlu.');
  }, [append, onTool]);

  const start = async () => {
    setError(null); setTurns([]); setCards([]); setStatus('connecting');
    // dibuat di dalam klik supaya Safari mengizinkan audio
    const p = new PcmPlayer();
    p.onPlayingChange = (on) => setStatus((st) => (st === 'listening' || st === 'speaking' ? (on ? 'speaking' : 'listening') : st));
    p.unlock();
    player.current = p;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Browser ini belum bisa merekam suara.');
      const res = await fetch('/api/live/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, topic }) });
      const t = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(t.error ?? `Server menjawab galat ${res.status}.`);
      conv.current = t.conversation_id;
      const { GoogleGenAI, Modality } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: t.token, httpOptions: { apiVersion: 'v1alpha', ...(t.base_url ? { baseUrl: t.base_url } : {}) } });
      session.current = await ai.live.connect({
        model: t.model,
        config: { responseModalities: [Modality.AUDIO] },
        callbacks: {
          onmessage: onMessage,
          onerror: () => { void finish('Sambungan ke Gemini bermasalah.'); setStatus('error'); },
          onclose: (e) => { if (session.current) { setStatus(e.code === 1000 ? 'ended' : 'error'); void finish(e.code === 1000 ? undefined : `Sambungan ditutup Gemini${e.reason ? `: ${e.reason}` : ''}.`); } },
        },
      });
      const m = new MicStream((b64) => session.current?.sendRealtimeInput({ audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } }), (v) => { micLevel.current = v; });
      mic.current = m;
      await m.start();
      started.current = Date.now();
      setStatus('listening');
      if (mode === 'english') session.current?.sendClientContent({ turns: [{ role: 'user', parts: [{ text: topic ? `Let's talk about ${topic}.` : 'Hi, let\'s start.' }] }], turnComplete: true });
    } catch (e) {
      const name = (e as Error).name;
      await finish(name === 'NotAllowedError' ? 'Izin mikrofon ditolak. Izinkan mikrofon untuk Kompas di pengaturan browser.' : (e as Error).message || 'Tidak bisa memulai percakapan.');
      setStatus('error');
    }
  };

  const decide = async (id: string, d: 'approve' | 'reject') => {
    const e = edits[id] ? { [id]: Object.fromEntries(Object.entries(edits[id]).map(([k, v]) => [k, v.value])) } : undefined;
    const r = await confirmActions([id], d, e).catch(() => ({ ok: false, message: 'Gagal menghubungi server.' }));
    if (!r.ok) { setError(r.message); return; }
    setCards((x) => x.map((c) => (c.card.id === id ? { ...c, state: d === 'approve' ? 'approved' : 'rejected' } : c)));
    // beri tahu Ra hasil keputusan, supaya ia tidak bertanya lagi
    session.current?.sendClientContent({ turns: [{ role: 'user', parts: [{ text: `[layar] Pengguna ${d === 'approve' ? 'menyetujui' : 'menolak'} usulan ${id}.` }] }], turnComplete: false });
    if (d === 'approve') router.refresh();
  };

  const live = status === 'listening' || status === 'speaking';
  const orbMode: OrbMode = status === 'connecting' ? 'connecting' : !live ? 'idle' : muted && status === 'listening' ? 'muted' : status;
  // saat Ra bicara ikuti suaranya, selain itu ikuti mikrofon
  const orbLevel = () => (status === 'speaking' ? player.current?.level() ?? 0 : micLevel.current);
  return (
    <section aria-label={mode === 'english' ? 'Percakapan bahasa Inggris dengan Ra' : 'Percakapan langsung dengan Ra'} className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-3">
        <RaAvatar size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold" role="status">{LABEL[status]}</p>
          <p className="text-[12px] text-muted">{mode === 'english' ? 'English conversation · bicara bebas' : 'Bicara biasa, Ra bisa dipotong kapan saja'}</p>
        </div>
      </div>

      <div className="flex justify-center py-1">
        <VoiceOrb mode={orbMode} level={orbLevel} size={turns.length || cards.length ? 132 : 176} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        {turns.length === 0 && status !== 'error' && (
          <p className="py-4 text-center text-[13px] text-muted">
            {status === 'idle' ? (mode === 'english' ? 'Tekan Mulai, lalu ngobrol dalam bahasa Inggris. Ra akan membalas dengan suara.' : 'Tekan Mulai, lalu bicara seperti menelepon. Mis. "tadi beli bensin tiga puluh ribu pakai gopay".') : 'Silakan bicara...'}
          </p>
        )}
        <div className="flex flex-col gap-2">
          {turns.map((t, i) => (
            <p key={i} lang={mode === 'english' ? 'en' : undefined}
              className={t.role === 'user' ? 'ml-auto max-w-[85%] rounded-[18px] rounded-br-[4px] bg-accent-fill px-3.5 py-2 text-[14px] text-on-accent' : 'max-w-[90%] text-[14px]'}>
              {t.text}
            </p>
          ))}
          {cards.map(({ card, state }) => (
            <div key={card.id} className={`flex flex-col gap-2 ${state === 'pending' ? '' : 'opacity-60'}`}>
              <ProposalCard card={card} lookups={lookups} edits={edits[card.id]} readOnly={state !== 'pending'}
                onEdit={(f, v) => setEdits((x) => ({ ...x, [card.id]: { ...x[card.id], [f]: v } }))} />
              {state === 'pending'
                ? <div className="grid grid-cols-3 gap-3">
                  <button type="button" className="btn" onClick={() => void decide(card.id, 'reject')}>Tolak</button>
                  <button type="button" className={`btn col-span-2 ${card.destructive ? 'btn-danger' : 'btn-primary'}`} onClick={() => void decide(card.id, 'approve')}>Setujui</button>
                </div>
                : <p className="text-[12px] font-semibold">{state === 'approved' ? 'Disimpan.' : 'Ditolak.'}</p>}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>

      {error && <p role="alert" className="text-[13px] text-danger-fg">{error}</p>}
      <div className="flex items-center gap-3">
        {live ? (
          <>
            <button type="button" className="btn inline-flex flex-1 items-center justify-center gap-2" aria-pressed={muted}
              onClick={() => { const v = !muted; setMuted(v); if (mic.current) mic.current.muted = v; }}>
              {muted ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}{muted ? 'Nyalakan mic' : 'Bisukan'}
            </button>
            <button type="button" className="btn btn-danger inline-flex flex-1 items-center justify-center gap-2" onClick={() => void finish()}>
              <PhoneOff size={18} aria-hidden="true" />Akhiri
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary flex-1" disabled={status === 'connecting'} onClick={() => void start()}>{status === 'connecting' ? 'Menyambung...' : status === 'idle' ? 'Mulai' : 'Mulai lagi'}</button>
            {onClose && <button type="button" className="btn" onClick={onClose}>Kembali ke chat</button>}
          </>
        )}
      </div>
    </section>
  );
}
