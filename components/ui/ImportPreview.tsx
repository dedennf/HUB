/** Jumlah per jenis data dalam grid dua kolom (DESIGN 6, Kondisi.dc.html). */
export function ImportPreview({ fileName, exported, counts }: { fileName: string; exported?: string | null; counts: { label: string; total: number; fresh: number }[] }) {
  return (
    <section className="card p-4" aria-label={`Isi ${fileName}`}>
      <p className="truncate text-[14px] font-bold">{fileName}</p>
      {exported && <p className="text-[12px] text-muted">Diekspor {exported}</p>}
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {counts.map((c) => (
          <li key={c.label} className="flex min-h-11 items-center justify-between rounded-xl bg-bg px-3 text-[13px]">
            <span className="truncate">{c.label}</span>
            <span className="num font-bold">{c.total}{c.fresh !== c.total ? <span className="font-normal text-muted"> ({c.fresh} baru)</span> : null}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
