'use client';
import { useEffect } from 'react';
import { applyTheme, THEME_KEY, type ThemeChoice } from './theme';

/** Menyamakan tema perangkat dengan pilihan yang tersimpan di database (bisa diubah dari perangkat lain). */
export function ThemeSync({ theme }: { theme: ThemeChoice }) {
  useEffect(() => {
    let local: string | null = null;
    try { local = localStorage.getItem(THEME_KEY); } catch { /* abaikan */ }
    if (local !== theme) applyTheme(theme);
  }, [theme]);
  return null;
}
