'use client';

/** 1B · 3B · 6B · 1T. Tinggi 44 px, aktif berlatar accent. */
export function RangeTabs<K extends string>({ options, value, onChange }: { options: { key: K; label: string; name: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div role="radiogroup" aria-label="Rentang grafik" className="flex gap-1.5">
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={o.key === value} aria-label={o.name} onClick={() => onChange(o.key)}
          className={`h-11 flex-1 rounded-[22px] text-[12px] font-semibold lg:w-11 lg:flex-none ${o.key === value ? 'bg-accent-fill text-on-accent' : 'text-muted hover:bg-track'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
