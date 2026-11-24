'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import type { CardView, Lookups } from '@/lib/agent/cards';
import { createLocalFlag } from '@/lib/local-flag';

const collapsedFlag = createLocalFlag('kompas-ra-collapsed');
const DESKTOP = '(min-width: 64rem)';

export type RaMessage =
  | { id: string; from: 'user'; text: string }
  | {
    id: string; from: 'ra'; text: string; lines?: string[]; offline?: string | null;
    actions?: CardView[]; lookups?: Lookups; edits?: CardEdits;
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
};
const RaContext = createContext<Ctx | null>(null);

/**
 * Status Ra: sheet di HP, panel kanan di laptop. Ctrl+K / Cmd+K membuka Ra dan memfokuskan inputnya.
 * Percakapan (pesan dan id percakapan di server) disimpan di sini supaya sama di panel dan sheet.
 */
export function RaProvider({ children }: { children: ReactNode }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [messages, setMessages] = useState<RaMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
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
    <RaContext value={{ messages, setMessages, conversationId, setConversationId, sheetOpen, openRa, closeSheet: () => setSheetOpen(false), panelCollapsed, setPanelCollapsed, inputRef }}>
      {children}
    </RaContext>
  );
}

export function useRa(): Ctx {
  const ctx = useContext(RaContext);
  if (!ctx) throw new Error('useRa harus dipakai di dalam RaProvider');
  return ctx;
}
