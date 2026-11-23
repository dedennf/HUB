/** Sakelar English Mode (aktif di Fase 7). */
export function EnglishModeSwitch() {
  return (
    <label className="flex min-h-11 items-center gap-2 text-[12px] text-muted">
      English Mode
      <span className="relative inline-flex h-6 w-10 items-center rounded-full bg-track">
        <input type="checkbox" role="switch" disabled className="peer sr-only" aria-describedby="english-mode-note" />
        <span className="ml-0.5 h-5 w-5 rounded-full bg-surface shadow" />
      </span>
      <span id="english-mode-note" className="sr-only">Belum tersedia, hadir bersama modul Bahasa Inggris</span>
    </label>
  );
}
