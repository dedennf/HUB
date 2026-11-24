import { Mic } from 'lucide-react';

/** Tampilan merekam suara: gelombang, timer besar, tombol mic 76 px (DESIGN 6, Kondisi.dc.html). */
export function RecordingView({ seconds, levels }: { seconds: number; levels: number[] }) {
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <p className="text-[14px] text-muted">Ra mendengarkan...</p>
      <div className="flex h-12 items-center gap-1" aria-hidden="true">
        {levels.map((l, i) => <span key={i} className="w-1 rounded-full bg-accent" style={{ height: `${Math.max(8, l * 48)}px` }} />)}
      </div>
      <p className="num font-display text-[28px] font-extrabold" aria-live="off" aria-label={`Merekam ${seconds} detik`}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p>
      <span className="anim-pulse inline-flex h-28 w-28 items-center justify-center rounded-full bg-accent-soft">
        <span className="inline-flex h-[76px] w-[76px] items-center justify-center rounded-full bg-accent-fill text-on-accent">
          <Mic size={30} strokeWidth={1.8} aria-hidden="true" />
        </span>
      </span>
      <p className="text-[12px] text-muted">Lepas atau tekan Kirim untuk mengirim · geser ke kiri untuk batal · maks 60 detik</p>
    </div>
  );
}
