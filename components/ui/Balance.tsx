'use client';
import { useEffect, useRef, useState } from 'react';
import { usePrivacy } from '@/components/providers/PrivacyProvider';
import { formatRp } from '@/lib/format';

export const MASK = 'Rp•••••••';

/**
 * Nominal saldo atau kekayaan: disembunyikan saat mode privasi aktif (DESIGN 4).
 * Perubahan nilai dianimasikan 300 ms, kecuali prefers-reduced-motion.
 */
export function Balance({ value, className = '' }: { value: number; className?: string }) {
  const { hidden } = usePrivacy();
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = instant ? 1 : Math.min(1, (t - start) / 300);
      setShown(Math.round(from + (value - from) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={`num ${className}`}>{hidden ? MASK : formatRp(shown)}</span>;
}
