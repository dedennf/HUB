'use client';
import { Camera, ImageIcon, Mic, SendHorizontal } from 'lucide-react';
import { useRef, useState, type RefObject } from 'react';

export type VoiceControls = {
  recording: boolean; sending: boolean;
  start: () => void; stop: (send: boolean) => void;
};
const HOLD_MS = 350;
const CANCEL_PX = 80;

/**
 * Bar input Ra: kamera, galeri, teks, mikrofon (DESIGN 6).
 * Teks aktif bila `onSubmit` diberikan. Kamera dan galeri aktif bila `onPick` diberikan (Fase 4).
 * Mic (Fase 5): tahan untuk bicara lalu lepas untuk kirim, geser ke kiri untuk batal. Ketuk sekali untuk mulai, ketuk lagi untuk kirim.
 * Saat kolom teks terisi, tombol bulat berubah jadi tombol kirim.
 */
export function RaInputBar({ inputRef, onSubmit, busy = false, showCamera = true, onPick, picking = false, voice }: {
  inputRef?: RefObject<HTMLInputElement | null>; onSubmit?: (text: string) => void; busy?: boolean; showCamera?: boolean;
  onPick?: (mode: 'camera' | 'gallery') => void; picking?: boolean; voice?: VoiceControls;
}) {
  const active = !!onSubmit;
  const [hasText, setHasText] = useState(false);
  const press = useRef<{ at: number; x: number; wasRecording: boolean } | null>(null);
  const showMic = !!voice && !hasText;
  const iconBtn = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-fg disabled:opacity-50';
  return (
    <form className="flex items-center gap-2" aria-label="Perintah untuk Ra" onSubmit={(e) => {
      e.preventDefault();
      const input = e.currentTarget.elements.namedItem('ra-text') as HTMLInputElement;
      const text = input.value.trim();
      if (!text || !onSubmit || busy) return;
      onSubmit(text);
      input.value = '';
      setHasText(false);
    }}>
      {showCamera && (
        <button type="button" className={iconBtn} aria-label={onPick ? 'Foto struk dengan kamera' : 'Foto struk dengan kamera (segera hadir)'} disabled={!onPick || picking} onClick={() => onPick?.('camera')}>
          <Camera size={20} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}
      <button type="button" className={iconBtn} aria-label={onPick ? 'Pilih struk dari galeri atau berkas (bisa beberapa, PDF juga)' : 'Pilih struk dari galeri (segera hadir)'} disabled={!onPick || picking} onClick={() => onPick?.('gallery')}>
        <ImageIcon size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <label className="min-w-0 flex-1">
        <span className="sr-only">Ketik perintah untuk Ra</span>
        <input
          ref={inputRef}
          name="ra-text"
          autoComplete="off"
          maxLength={500}
          enterKeyHint="send"
          readOnly={!active}
          aria-disabled={!active}
          placeholder={active ? 'Ketik perintah, mis. kopi 18rb dana' : 'Ra segera hadir'}
          onInput={(e) => setHasText(!!e.currentTarget.value.trim())}
          className="h-11 w-full rounded-full border border-line bg-surface px-4 text-[14px] text-fg outline-none placeholder:text-muted focus:border-accent"
        />
      </label>
      {showMic ? (
        <button
          type="button"
          className={`inline-flex h-12 w-12 shrink-0 touch-none select-none items-center justify-center rounded-full text-on-accent disabled:opacity-40 ${voice.recording ? 'bg-danger-fg' : 'bg-accent-fill'}`}
          aria-label={voice.recording ? 'Kirim pesan suara' : 'Bicara dengan Ra: tahan sambil bicara, atau ketuk untuk mulai'}
          aria-pressed={voice.recording}
          disabled={voice.sending || busy}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            press.current = { at: Date.now(), x: e.clientX, wasRecording: voice.recording };
            if (!voice.recording) voice.start();
          }}
          onPointerMove={(e) => {
            const p = press.current;
            // geser ke kiri saat menahan = batal
            if (p && !p.wasRecording && p.x - e.clientX > CANCEL_PX) { press.current = null; voice.stop(false); }
          }}
          onPointerUp={() => {
            const p = press.current;
            press.current = null;
            if (!p) return;
            if (p.wasRecording) voice.stop(true); // ketukan kedua di mode ketuk
            else if (Date.now() - p.at >= HOLD_MS) voice.stop(true); // lepas setelah menahan
            // ketukan singkat: tetap merekam sampai diketuk lagi
          }}
          onPointerCancel={() => { if (press.current && !press.current.wasRecording) voice.stop(false); press.current = null; }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            if (voice.recording) voice.stop(true); else voice.start();
          }}
        >
          <Mic size={22} strokeWidth={1.8} aria-hidden="true" />
        </button>
      ) : active ? (
        <button type="submit" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-fill text-on-accent disabled:opacity-40" aria-label="Kirim ke Ra" disabled={busy}>
          <SendHorizontal size={22} strokeWidth={1.8} aria-hidden="true" />
        </button>
      ) : (
        <button type="button" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-fill text-on-accent disabled:opacity-40" aria-label="Bicara dengan Ra (segera hadir)" disabled>
          <Mic size={22} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}
    </form>
  );
}
