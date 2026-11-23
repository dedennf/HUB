'use client';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useState, useTransition } from 'react';
import { applyTheme, type ThemeChoice } from '@/components/providers/theme';
import { saveTheme } from '../actions';

const OPTIONS: { v: ThemeChoice; l: string; d: string; icon: typeof Sun }[] = [
  { v: 'auto', l: 'Otomatis', d: 'Ikut pengaturan HP atau laptop', icon: Monitor },
  { v: 'light', l: 'Terang', d: 'Selalu terang', icon: Sun },
  { v: 'dark', l: 'Gelap', d: 'Selalu gelap', icon: Moon },
];

/** Pilihan tema langsung diterapkan, lalu disimpan ke database agar ikut di perangkat lain. */
export function ThemePicker({ current }: { current: ThemeChoice }) {
  const [value, setValue] = useState(current);
  const [error, setError] = useState('');
  const [, start] = useTransition();
  const pick = (v: ThemeChoice) => {
    setValue(v);
    applyTheme(v);
    start(async () => {
      const r = await saveTheme(v);
      setError(r.ok ? '' : r.message ?? 'Gagal menyimpan tema.');
    });
  };
  return (
    <fieldset>
      <legend className="sr-only">Tema</legend>
      <div className="card rows overflow-hidden">
        {OPTIONS.map((o) => (
          <label key={o.v} className="flex min-h-[60px] cursor-pointer items-center gap-3.5 px-4 py-2.5 hover:bg-bg">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent"><o.icon size={20} strokeWidth={1.8} aria-hidden="true" /></span>
            <span className="flex-1"><span className="block text-[14px] font-semibold">{o.l}</span><span className="block text-[12px] text-muted">{o.d}</span></span>
            <input type="radio" name="theme" value={o.v} checked={value === o.v} onChange={() => pick(o.v)} className="h-5 w-5 accent-[var(--accent)]" />
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-[13px] text-negative">{error}</p>}
    </fieldset>
  );
}
