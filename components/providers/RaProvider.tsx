'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { createLocalFlag } from '@/lib/local-flag';

const collapsedFlag = createLocalFlag('kompas-ra-collapsed');
const DESKTOP = '(min-width: 64rem)';

type Ctx = {
  sheetOpen: boolean;
  openRa: () => void;
  closeSheet: () => void;
  panelCollapsed: boolean;
  setPanelCollapsed: (v: boolean) => void;
  inputRef: RefObject<HTMLInputElement | null>;
};
const RaContext = createContext<Ctx | null>(null);

/**
 * Status Ra: sheet di HP, panel kanan di laptop. Ctrl+K / Cmd+K membuka Ra dan memfokuskan inputnya.
 * Ra belum tersambung ke Gemini (Fase 3), jadi isinya masih "Ra segera hadir".
 */
export function RaProvider({ children }: { children: ReactNode }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const panelCollapsed = useSyncExternalStore(collapsedFlag.subscribe, collapsedFlag.get, collapsedFlag.getServer);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setPanelCollapsed = useCallback((v: boolean) => collapsedFlag.set(v), []);

  const openRa = useCallback(() => {
    if (window.matchMedia(DESKTOP).matches) {
      setPanelCollapsed(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setSheetOpen(true);
    }
  }, [setPanelCollapsed]);

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
    <RaContext value={{ sheetOpen, openRa, closeSheet: () => setSheetOpen(false), panelCollapsed, setPanelCollapsed, inputRef }}>
      {children}
    </RaContext>
  );
}

export function useRa(): Ctx {
  const ctx = useContext(RaContext);
  if (!ctx) throw new Error('useRa harus dipakai di dalam RaProvider');
  return ctx;
}
