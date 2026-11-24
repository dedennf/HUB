'use client';
import { Check } from 'lucide-react';
import { useEffect, useRef } from 'react';

/** Toast setelah simpan: teks, tombol Batalkan, bar hitung mundur 10 detik (DESIGN 6 dan 7). */
export function UndoToast({ message, onUndo, onDone, undoing }: { message: string; onUndo: () => void; onDone: () => void; undoing?: boolean }) {
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  useEffect(() => {
    const t = setTimeout(() => done.current(), 10_000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div role="status" className="anim-toast fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md overflow-hidden rounded-2xl bg-toast-bg text-toast-fg shadow-lg lg:bottom-6">
      <div className="flex items-center gap-3 px-4 py-3">
        <Check size={18} strokeWidth={2} className="shrink-0 text-positive" aria-hidden="true" />
        <span className="flex-1 text-[13px]">{message}</span>
        <button type="button" onClick={onUndo} disabled={undoing} className="min-h-11 px-2 text-[13px] font-bold text-accent-strong">
          {undoing ? 'Membatalkan...' : 'Batalkan'}
        </button>
      </div>
      <div className="mx-4 mb-3 h-1 rounded-full bg-white/15"><div className="anim-countdown h-1 rounded-full bg-accent" /></div>
    </div>
  );
}
