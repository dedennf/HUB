'use client';
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { createLocalFlag } from '@/lib/local-flag';

const flag = createLocalFlag('kompas-privacy');
type Ctx = { hidden: boolean; toggle: () => void };
const PrivacyContext = createContext<Ctx>({ hidden: false, toggle: () => {} });

/** Mode privasi saldo (DESIGN 4). Disimpan per perangkat di localStorage. */
export function PrivacyProvider({ children }: { children: ReactNode }) {
  const hidden = useSyncExternalStore(flag.subscribe, flag.get, flag.getServer);
  return <PrivacyContext value={{ hidden, toggle: () => flag.set(!flag.get()) }}>{children}</PrivacyContext>;
}

export const usePrivacy = () => useContext(PrivacyContext);
