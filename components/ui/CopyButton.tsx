'use client';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

/** Salin teks ke papan klip, dengan konfirmasi singkat. Cadangan untuk browser lama: pilih teks lewat textarea. */
export function CopyButton({ text, label = 'Salin', copiedLabel = 'Tersalin', className = '' }: { text: string; label?: string; copiedLabel?: string; className?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = document.createElement('textarea');
      t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } finally { t.remove(); }
    }
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  };
  return (
    <button type="button" onClick={() => void copy()} aria-live="polite"
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold ${done ? 'border-positive text-positive' : 'border-line text-accent-strong hover:border-accent'} ${className}`}>
      {done ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{done ? copiedLabel : label}
    </button>
  );
}
