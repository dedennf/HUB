import { TriangleAlert } from 'lucide-react';

/** Ra tidak tersambung ke Gemini (kuota habis, belum diatur, jaringan): perintah dibaca pengurai lokal. */
export function OfflineBanner({ reason = 'kuota habis' }: { reason?: string }) {
  return (
    <div role="alert" className="flex gap-3 rounded-2xl border border-warn-fg/30 bg-warn-bg p-3 text-[13px] text-warn-fg">
      <TriangleAlert size={18} strokeWidth={1.8} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p>Ra sedang tidak tersambung ({reason}). Perintah dibaca pengurai lokal, cek lagi sebelum simpan.</p>
    </div>
  );
}
