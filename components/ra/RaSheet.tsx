'use client';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useRa } from '@/components/providers/RaProvider';
import { EnglishModeSwitch } from './EnglishModeSwitch';
import { RaComingSoon } from './RaComingSoon';
import { RaInputBar } from './RaInputBar';
import { RaAvatar } from './RaMark';

/** Bottom sheet Ra untuk HP (DESIGN 6, rujukan Agen.dc.html). */
export function RaSheet() {
  const { sheetOpen, closeSheet } = useRa();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (sheetOpen && !d.open) d.showModal();
    if (!sheetOpen && d.open) d.close();
  }, [sheetOpen]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="ra-sheet-title"
      onClose={closeSheet}
      onClick={(e) => { if (e.target === dialogRef.current) closeSheet(); }}
      className="m-0 mt-auto h-[88dvh] max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-overlay lg:hidden"
    >
      <div className="anim-sheet flex h-full flex-col rounded-t-3xl bg-bg">
        <div className="flex justify-center pt-2.5"><span className="h-1 w-10 rounded-full bg-line" aria-hidden="true" /></div>
        <header className="flex items-center justify-between px-5 pt-2">
          <span className="flex items-center gap-2.5">
            <RaAvatar size={30} />
            <h2 id="ra-sheet-title" className="font-display text-[17px] font-bold">Ra</h2>
          </span>
          <span className="flex items-center gap-1">
            <EnglishModeSwitch />
            <button type="button" onClick={closeSheet} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted" aria-label="Tutup Ra">
              <X size={20} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </span>
        </header>
        <div className="flex-1 overflow-y-auto px-5"><RaComingSoon /></div>
        <div className="border-t border-line bg-bg px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          <RaInputBar />
        </div>
      </div>
    </dialog>
  );
}
