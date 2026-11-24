'use client';
import { Camera, ImageIcon, Mic, SendHorizontal } from 'lucide-react';
import type { RefObject } from 'react';

/**
 * Bar input Ra: kamera, galeri, teks, mikrofon (DESIGN 6).
 * Teks aktif bila `onSubmit` diberikan. Kamera dan galeri aktif bila `onPick` diberikan (Fase 4). Mic menunggu fase Suara.
 */
export function RaInputBar({ inputRef, onSubmit, busy = false, showCamera = true, onPick, picking = false }: {
  inputRef?: RefObject<HTMLInputElement | null>; onSubmit?: (text: string) => void; busy?: boolean; showCamera?: boolean;
  onPick?: (mode: 'camera' | 'gallery') => void; picking?: boolean;
}) {
  const active = !!onSubmit;
  const iconBtn = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-fg disabled:opacity-50';
  return (
    <form className="flex items-center gap-2" aria-label="Perintah untuk Ra" onSubmit={(e) => {
      e.preventDefault();
      const input = e.currentTarget.elements.namedItem('ra-text') as HTMLInputElement;
      const text = input.value.trim();
      if (!text || !onSubmit || busy) return;
      onSubmit(text);
      input.value = '';
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
          className="h-11 w-full rounded-full border border-line bg-surface px-4 text-[14px] text-fg outline-none placeholder:text-muted focus:border-accent"
        />
      </label>
      {active ? (
        // Selama suara belum tersedia (fase Suara), tombol bulat accent menjadi tombol kirim.
        <button type="submit" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-fill text-on-accent disabled:opacity-40" aria-label="Kirim ke Ra" disabled={busy}>
          <SendHorizontal size={22} strokeWidth={1.8} aria-hidden="true" />
        </button>
      ) : (
        <button type="button" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-fill text-on-accent disabled:opacity-40" aria-label="Tahan untuk bicara dengan Ra (segera hadir)" disabled>
          <Mic size={22} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}
    </form>
  );
}
