'use client';
import { PanelRightClose, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { useRa } from '@/components/providers/RaProvider';
import { EnglishModeSwitch } from './EnglishModeSwitch';
import { RaChat } from './RaChat';
import { RaAvatar } from './RaMark';

/** Panel Ra kanan untuk laptop (DESIGN 5.2). Bisa diciutkan ke ikon. Ctrl+K memfokuskan inputnya. */
export function RaPanel() {
  const { panelCollapsed, setPanelCollapsed, inputRef } = useRa();

  if (panelCollapsed) {
    return (
      <aside aria-label="Ra" className="sticky top-0 hidden h-dvh w-16 shrink-0 flex-col items-center border-l border-line bg-surface pt-5 lg:flex">
        <button type="button" onClick={() => setPanelCollapsed(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-full" aria-label="Buka panel Ra (Ctrl+K)">
          <RaAvatar size={36} />
        </button>
      </aside>
    );
  }

  return (
    <aside aria-label="Ra" className="sticky top-0 hidden h-dvh w-[360px] shrink-0 flex-col border-l border-line bg-surface lg:flex">
      <header className="flex items-center justify-between px-5 pt-4">
        <span className="flex items-center gap-2.5">
          <RaAvatar size={30} />
          <h2 className="font-display text-[17px] font-bold">Ra</h2>
        </span>
        <span className="flex items-center">
          <EnglishModeSwitch />
          <button type="button" onClick={() => setPanelCollapsed(true)} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted" aria-label="Ciutkan panel Ra">
            <PanelRightClose size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-3">
        <ReceiptDropZone />
        <RaChat inputRef={inputRef} showCamera={false} />
      </div>
      <p className="px-5 pb-4 text-center text-[11px] text-muted">Ctrl+K untuk membuka Ra dari mana saja</p>
    </aside>
  );
}

/** Zona seret struk (DESIGN 5.2). Klik juga membuka pemilih berkas. Tempel (Ctrl+V) ditangani RaProvider. */
function ReceiptDropZone() {
  const { addReceipts, pickReceipts, scanning } = useRa();
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      disabled={!!scanning}
      onClick={() => pickReceipts('gallery')}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        addReceipts([...e.dataTransfer.files]);
      }}
      className={`mt-3 rounded-2xl border border-dashed px-4 py-3 text-center text-muted transition-colors ${over ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent'}`}
      aria-label="Unggah struk: seret berkas ke sini, klik untuk memilih, atau tempel screenshot dengan Ctrl+V"
    >
      <ReceiptText size={20} strokeWidth={1.8} className="mx-auto mb-1" aria-hidden="true" />
      <span className="block text-[12px]"><span className="font-semibold text-fg">Seret struk ke sini</span> atau tempel screenshot (Ctrl+V). Foto, PDF, bisa beberapa sekaligus.</span>
    </button>
  );
}
