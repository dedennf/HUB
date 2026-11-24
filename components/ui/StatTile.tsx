/** Angka kecil dengan label (DESIGN: StatTile, mis. streak, diulang hari ini, dikuasai). */
export function StatTile({ label, value, unit }: { label: string; value: number | string; unit?: string }) {
  return (
    <div className="card flex flex-col gap-0.5 px-3 py-3">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="num font-display text-[20px] font-extrabold">{value}{unit && <span className="ml-1 text-[13px] font-semibold text-muted">{unit}</span>}</span>
    </div>
  );
}
