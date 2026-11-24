'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { ApiFailure, confirmActions, sendVoiceToRa } from '@/lib/agent/client';
import { SILENCE_RMS, toGeminiAudio, VoiceRecorder } from '@/lib/voice/recorder';
import type { CardView, Lookups } from '@/lib/agent/cards';
import type { EnglishFeedback } from '@/lib/agent/service';
import { setEnglishMode as saveEnglishMode } from '@/app/(dashboard)/bahasa/actions';
import { createLocalFlag } from '@/lib/local-flag';
import { ACCEPT_GALLERY, prepareReceipt, uploadReceipt, type PreparedReceipt } from '@/lib/receipts/client';
import type { ReceiptResult } from '@/lib/receipts/service';

const collapsedFlag = createLocalFlag('kompas-ra-collapsed');
const DESKTOP = '(min-width: 64rem)';

export type RaLink = { label: string; href: string };
export type RaMessage =
  | { id: string; from: 'user'; text: string; images?: (string | null)[]; voiceSeconds?: number }
  | {
    id: string; from: 'ra'; text: string; lines?: string[]; links?: RaLink[]; offline?: string | null;
    actions?: CardView[]; lookups?: Lookups; edits?: CardEdits; englishFeedback?: EnglishFeedback | null;
    status?: 'pending' | 'approved' | 'cancelled' | 'undone';
  };
/** Ubahan chip per aksi: field → nilai baru (id atau tanggal) dan label tampilannya. */
export type CardEdits = Record<string, Record<string, { value: string; label: string }>>;

type Ctx = {
  messages: RaMessage[];
  setMessages: React.Dispatch<React.SetStateAction<RaMessage[]>>;
  conversationId: string | null;
  setConversationId: (id: string | null) => void;
  sheetOpen: boolean;
  openRa: () => void;
  closeSheet: () => void;
  panelCollapsed: boolean;
  setPanelCollapsed: (v: boolean) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  /** Struk (Fase 4): buka pemilih berkas, kirim berkas (dari pilih, seret, atau tempel), status membaca. */
  pickReceipts: (mode: 'camera' | 'gallery') => void;
  addReceipts: (files: File[]) => void;
  scanning: { preview: string | null; done: number; total: number } | null;
  /** Suara (Fase 5): mulai merekam, kirim, atau batal. */
  voice: VoiceState;
  /** English Mode (SPEC 10.2.5): tersimpan di setelan, dibaca server saat memproses pesan. */
  englishMode: boolean;
  setEnglishMode: (on: boolean) => void;
  startVoice: () => void;
  stopVoice: (send: boolean) => void;
};
export type VoiceState = { state: 'idle' | 'recording' | 'sending'; seconds: number; levels: number[] };
const RaContext = createContext<Ctx | null>(null);

/**
 * Status Ra: sheet di HP, panel kanan di laptop. Ctrl+K / Cmd+K membuka Ra dan memfokuskan inputnya.
 * Percakapan (pesan dan id percakapan di server) disimpan di sini supaya sama di panel dan sheet.
 */
export function RaProvider({ children, englishMode: initialEnglish = false }: { children: ReactNode; englishMode?: boolean }) {
  const [englishMode, setEnglish] = useState(initialEnglish);
  const setEnglishMode = useCallback((on: boolean) => {
    setEnglish(on);
    void saveEnglishMode(on).catch(() => setEnglish(!on));
  }, []);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [messages, setMessages] = useState<RaMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const panelCollapsed = useSyncExternalStore(collapsedFlag.subscribe, collapsedFlag.get, collapsedFlag.getServer);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setPanelCollapsed = useCallback((v: boolean) => collapsedFlag.set(v), []);
  const [scanning, setScanning] = useState<Ctx['scanning']>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const convRef = useRef<string | null>(null);
  useEffect(() => { convRef.current = conversationId; }, [conversationId]);

  const openRa = useCallback(() => {
    if (window.matchMedia(DESKTOP).matches) {
      setPanelCollapsed(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setSheetOpen(true);
    }
  }, [setPanelCollapsed]);

  const addReceipts = useCallback(async (files: File[]) => {
    const list = files.slice(0, 10);
    if (!list.length) return;
    openRa();
    const uid = () => Math.random().toString(36).slice(2);
    const prepared: PreparedReceipt[] = [];
    const problems: string[] = [];
    for (const f of list) {
      try { prepared.push(await prepareReceipt(f)); } catch (e) { problems.push(e instanceof ApiFailure ? e.message : `${f.name}: gagal dibaca browser.`); }
    }
    // usulan lama yang belum diputuskan dianggap batal, sama seperti saat mengirim teks
    setMessages((m) => {
      const stale = m.flatMap((x) => (x.from === 'ra' && x.status === 'pending' ? (x.actions ?? []).map((a) => a.id) : []));
      if (stale.length) void confirmActions(stale, 'reject').catch(() => {});
      return m;
    });
    setMessages((m) => [...m.map((x) => (x.from === 'ra' && x.status === 'pending' ? { ...x, status: 'cancelled' as const } : x)),
      { id: uid(), from: 'user', text: list.length > 1 ? `${list.length} struk` : 'Struk', images: prepared.map((p) => p.preview) }]);
    const cards: CardView[] = [];
    const lines: string[] = [...problems];
    const links: RaLink[] = [];
    let lookups: Lookups | undefined;
    let offline: string | null = null;
    for (let i = 0; i < prepared.length; i++) {
      setScanning({ preview: prepared[i].preview, done: i, total: prepared.length });
      let r: ReceiptResult;
      try {
        r = await uploadReceipt(prepared[i], convRef.current);
      } catch (e) {
        lines.push(`${prepared[i].name}: ${e instanceof ApiFailure ? e.message : 'gagal diunggah.'}`);
        continue;
      }
      if (r.status === 'proposed') {
        cards.push(...r.proposed_actions);
        lookups = r.lookups;
        convRef.current = r.conversation_id;
        setConversationId(r.conversation_id);
      } else {
        lines.push(prepared.length > 1 ? `${prepared[i].name}: ${r.message}` : r.message);
        if (r.status === 'duplicate' && r.transaction) links.push({ label: `Buka ${r.transaction.label}`, href: r.transaction.href });
        if (r.status === 'offline') offline = r.message;
      }
    }
    setScanning(null);
    const text = cards.length
      ? `${cards.length > 1 ? `${cards.length} struk terbaca` : 'Struk terbaca'}. Cek dulu sebelum disimpan.`
      : offline ? 'Struk belum bisa dibaca.' : 'Tidak ada struk yang bisa dicatat.';
    setMessages((m) => [...m, {
      id: uid(), from: 'ra', text, lines: lines.length ? lines : undefined, links: links.length ? links : undefined,
      actions: cards.length ? cards : undefined, lookups, edits: {}, status: cards.length ? 'pending' : undefined,
    }]);
  }, [openRa]);

  const [voice, setVoice] = useState<VoiceState>({ state: 'idle', seconds: 0, levels: [] });
  const recRef = useRef<VoiceRecorder | null>(null);
  const sayRa = useCallback((text: string, extra: Partial<Extract<RaMessage, { from: 'ra' }>> = {}) =>
    setMessages((m) => [...m, { id: Math.random().toString(36).slice(2), from: 'ra', text, ...extra }]), []);

  const stopVoice = useCallback(async (send: boolean) => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    if (!send) { rec.cancel(); setVoice({ state: 'idle', seconds: 0, levels: [] }); return; }
    setVoice((v) => ({ ...v, state: 'sending' }));
    const out = await rec.stop();
    if (!out || out.seconds < 1) {
      setVoice({ state: 'idle', seconds: 0, levels: [] });
      sayRa('Rekamannya terlalu pendek. Tahan tombol mic sambil bicara, atau ketuk sekali untuk mulai dan ketuk lagi untuk kirim.');
      return;
    }
    if (out.peak >= 0 && out.peak < SILENCE_RMS) {
      setVoice({ state: 'idle', seconds: 0, levels: [] });
      sayRa('Tidak ada suara yang terdengar. Cek mikrofon, lalu bicara lebih dekat. Rekaman sunyi tidak dikirim.');
      return;
    }
    const msgId = Math.random().toString(36).slice(2);
    setMessages((m) => {
      const stale = m.flatMap((x) => (x.from === 'ra' && x.status === 'pending' ? (x.actions ?? []).map((a) => a.id) : []));
      if (stale.length) void confirmActions(stale, 'reject').catch(() => {});
      return [...m.map((x) => (x.from === 'ra' && x.status === 'pending' ? { ...x, status: 'cancelled' as const } : x)),
        { id: msgId, from: 'user', text: 'Mengirim pesan suara...', voiceSeconds: out.seconds }];
    });
    try {
      const audio = await toGeminiAudio(out.blob);
      const r = await sendVoiceToRa(audio.blob, audio.mime, convRef.current);
      if (r.conversation_id) { convRef.current = r.conversation_id; setConversationId(r.conversation_id); }
      // transkrip menggantikan teks gelembung pesan suara (SPEC 7.3: transkrip tampil di riwayat)
      setMessages((m) => m.map((x) => (x.id === msgId && x.from === 'user' ? { ...x, text: r.transcript ? `“${r.transcript}”` : 'Pesan suara (tidak tertranskrip)' } : x)));
      sayRa(r.reply, { actions: r.proposed_actions, lookups: r.lookups, offline: r.offline, edits: {}, status: r.proposed_actions.length ? 'pending' : undefined });
    } catch (e) {
      setMessages((m) => m.map((x) => (x.id === msgId && x.from === 'user' ? { ...x, text: 'Pesan suara (gagal terkirim)' } : x)));
      sayRa(e instanceof ApiFailure ? e.message : 'Ra sedang tidak tersambung ke server. Coba lagi sebentar lagi.');
    } finally {
      setVoice({ state: 'idle', seconds: 0, levels: [] });
    }
  }, [sayRa]);

  const startVoice = useCallback(async () => {
    if (recRef.current) return;
    openRa();
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      sayRa('Browser ini belum bisa merekam suara. Coba Chrome, Safari terbaru, atau ketik perintahnya.');
      return;
    }
    const rec = new VoiceRecorder((u) => setVoice((v) => (v.state === 'recording' ? { ...v, ...u } : v)), () => void stopVoice(true));
    recRef.current = rec;
    setVoice({ state: 'recording', seconds: 0, levels: [] });
    try {
      await rec.start();
    } catch (e) {
      recRef.current = null;
      setVoice({ state: 'idle', seconds: 0, levels: [] });
      const denied = (e as Error).name === 'NotAllowedError' || (e as Error).name === 'SecurityError';
      sayRa(denied
        ? 'Izin mikrofon ditolak. Izinkan mikrofon untuk Kompas di pengaturan browser, lalu coba lagi.'
        : 'Mikrofon tidak bisa dipakai. Pastikan tidak sedang dipakai aplikasi lain.');
    }
  }, [openRa, sayRa, stopVoice]);

  const pickReceipts = useCallback((mode: 'camera' | 'gallery') => {
    (mode === 'camera' ? cameraRef : galleryRef).current?.click();
  }, []);

  // Tempel screenshot (Ctrl+V) dari mana saja, kecuali saat menempel teks ke kolom isian
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf');
      if (!files.length) return;
      e.preventDefault();
      void addReceipts(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addReceipts]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openRa();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openRa]);

  return (
    <RaContext value={{ messages, setMessages, conversationId, setConversationId, pickReceipts, addReceipts: (f) => void addReceipts(f), scanning, voice, englishMode, setEnglishMode, startVoice: () => void startVoice(), stopVoice: (send) => void stopVoice(send), sheetOpen, openRa, closeSheet: () => setSheetOpen(false), panelCollapsed, setPanelCollapsed, inputRef }}>
      {children}
      {/* Pemilih struk (SPEC 7.2): kamera langsung, dan galeri/berkas tanpa atribut capture. */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { void addReceipts([...(e.target.files ?? [])]); e.target.value = ''; }} />
      <input ref={galleryRef} type="file" accept={ACCEPT_GALLERY} multiple className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { void addReceipts([...(e.target.files ?? [])]); e.target.value = ''; }} />
    </RaContext>
  );
}

export function useRa(): Ctx {
  const ctx = useContext(RaContext);
  if (!ctx) throw new Error('useRa harus dipakai di dalam RaProvider');
  return ctx;
}
