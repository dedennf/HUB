'use client';
import { PanelRightClose, ReceiptText } from 'lucide-react';
import { useRa } from '@/components/providers/RaProvider';
import { EnglishModeSwitch } from './EnglishModeSwitch';
import { RaComingSoon } from './RaComingSoon';
import { RaInputBar } from './RaInputBar';
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
      <div className="flex-1 overflow-y-auto px-5">
        <RaComingSoon />
        <div className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-muted" aria-disabled="true">
          <ReceiptText size={22} strokeWidth={1.8} className="mx-auto mb-2" aria-hidden="true" />
          <p className="text-[13px] font-semibold text-fg">Seret struk ke sini</p>
          <p className="text-[12px]">atau tempel screenshot (Ctrl+V). Membaca struk hadir bersama Ra.</p>
        </div>
      </div>
      <div className="px-5 pb-5 pt-3">
        <RaInputBar inputRef={inputRef} showCamera={false} />
        <p className="mt-2 text-center text-[11px] text-muted">Ctrl+K untuk membuka Ra dari mana saja</p>
      </div>
    </aside>
  );
}
