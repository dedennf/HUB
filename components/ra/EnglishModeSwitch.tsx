'use client';
import { useRa } from '@/components/providers/RaProvider';

/** Sakelar English Mode (SPEC 10.2.5): boleh memberi perintah dalam bahasa Inggris, Ra memberi umpan balik singkat. */
export function EnglishModeSwitch() {
  const { englishMode, setEnglishMode } = useRa();
  return (
    <button type="button" role="switch" aria-checked={englishMode} onClick={() => setEnglishMode(!englishMode)}
      className="flex min-h-11 items-center gap-2 text-[12px] text-muted" title="Tulis perintah dalam bahasa Inggris, Ra memberi koreksi singkat">
      English Mode
      <span className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${englishMode ? 'bg-accent-fill' : 'bg-track'}`} aria-hidden="true">
        <span className={`ml-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform ${englishMode ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  );
}
