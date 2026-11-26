import type { BandSummary } from '@/lib/english/ielts-store';

const fmt = (b: number | null) => (b == null ? '–' : b.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

function Bar({ label, band, target, note }: { label: string; band: number | null; target: number; note?: string }) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)_36px] items-center gap-2.5 text-[13px]">
      <span>{label}</span>
      <div className="relative h-2 rounded-full bg-line" title={note}>
        {band != null && <div className={`h-2 rounded-full ${band >= target ? 'bg-positive' : 'bg-accent'}`} style={{ width: `${(band / 9) * 100}%` }} />}
        <span aria-hidden="true" className="absolute -top-1 h-4 w-0.5 rounded bg-fg/50" style={{ left: `${(target / 9) * 100}%` }} />
      </div>
      <span className="num text-right font-bold">{note ?? fmt(band)}</span>
    </div>
  );
}

/** Perkiraan band IELTS per skill dibanding target. Garis tipis di tiap bar = target. */
export function BandCard({ s, target, daysLeft, testDate }: { s: BandSummary; target: number; daysLeft: number | null; testDate: string | null }) {
  const gap = s.overall != null ? target - s.overall : null;
  return (
    <section aria-label="Perkiraan band IELTS" className="card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] text-muted">Perkiraan band</p>
          <p className="font-display text-[36px] font-extrabold leading-none">{fmt(s.overall)}</p>
        </div>
        <div className="text-right">
          <p className="text-[12px] text-muted">Target</p>
          <p className="font-display text-[22px] font-extrabold leading-tight text-accent-strong">{fmt(target)}</p>
          <p className="text-[12px] text-muted">{testDate && daysLeft != null ? (daysLeft >= 0 ? `tes ${daysLeft} hari lagi` : 'tanggal tes sudah lewat') : 'tanggal tes belum diisi'}</p>
        </div>
      </div>
      <Bar label="Reading" band={s.reading} target={target} />
      <Bar label="Listening" band={s.listening} target={target} />
      <Bar label="Writing" band={s.writing} target={target} />
      <Bar label="Speaking" band={s.speaking} target={target} />
      <p className="text-[12px] text-muted">
        {s.overall == null
          ? 'Belum ada latihan bergaya IELTS. Perkiraan muncul setelah latihan Reading, Writing, atau Speaking pertama.'
          : gap != null && gap > 0 ? `Kurang ${fmt(gap)} band dari target. ` : 'Perkiraan sudah menyentuh target. '}
        Perkiraan dari latihan di Kompas, bukan skor resmi.
      </p>
    </section>
  );
}
