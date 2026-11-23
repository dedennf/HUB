'use client';
import { Camera, ImageIcon, Mic } from 'lucide-react';
import type { RefObject } from 'react';

/**
 * Bar input Ra: kamera, galeri, teks, mikrofon (DESIGN 6).
 * `active=false` (sebelum Fase 3): input bisa difokuskan (Ctrl+K) tetapi tidak mengirim apa pun.
 */
export function RaInputBar({ inputRef, active = false, showCamera = true }: { inputRef?: RefObject<HTMLInputElement | null>; active?: boolean; showCamera?: boolean }) {
  const iconBtn = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-fg disabled:opacity-50';
  return (
    <form className="flex items-center gap-2" onSubmit={(e) => e.preventDefault()} aria-label="Perintah untuk Ra">
      {showCamera && (
        <button type="button" className={iconBtn} aria-label="Foto struk dengan kamera" disabled={!active}>
          <Camera size={20} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}
      <button type="button" className={iconBtn} aria-label="Pilih struk dari galeri" disabled={!active}>
        <ImageIcon size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <label className="min-w-0 flex-1">
        <span className="sr-only">Ketik perintah untuk Ra</span>
        <input
          ref={inputRef}
          readOnly={!active}
          aria-disabled={!active}
          placeholder={active ? 'Ketik atau tahan mic...' : 'Ra segera hadir'}
          className="h-11 w-full rounded-full border border-line bg-surface px-4 text-[14px] text-fg outline-none placeholder:text-muted focus:border-accent"
        />
      </label>
      <button type="button" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-fill text-on-accent disabled:opacity-40" aria-label="Tahan untuk bicara dengan Ra" disabled={!active}>
        <Mic size={22} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </form>
  );
}
