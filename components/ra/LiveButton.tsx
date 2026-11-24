'use client';
import { AudioLines } from 'lucide-react';
import { useRa } from '@/components/providers/RaProvider';

/** Tombol "Ngobrol langsung" di kepala Ra: percakapan suara dua arah (Fase 8). */
export function LiveButton() {
  const { liveOpen, setLiveOpen, openRa } = useRa();
  return (
    <button type="button" onClick={() => { openRa(); setLiveOpen(!liveOpen); }} aria-pressed={liveOpen}
      aria-label={liveOpen ? 'Kembali ke chat Ra' : 'Ngobrol langsung dengan Ra (suara dua arah)'}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full ${liveOpen ? 'bg-accent-soft text-accent-strong' : 'text-muted hover:text-fg'}`}>
      <AudioLines size={20} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
