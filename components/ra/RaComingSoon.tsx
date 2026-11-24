import { RaAvatar } from './RaMark';

/** Isi Ra sebelum tersambung ke Gemini (DESIGN 6: "Ra segera hadir"). */
export function RaComingSoon() {
  return (
    <div className="flex flex-col items-center gap-3 px-2 py-8 text-center">
      <RaAvatar size={48} />
      <p className="font-display text-[16px] font-bold">Ra segera hadir</p>
      <p className="max-w-72 text-[13px] text-muted">
        Ra nanti bisa mencatat transaksi, tugas, dan struk dari kalimat, foto, atau suara, lalu meminta persetujuanmu sebelum menyimpan.
        Untuk sekarang, catat lewat tombol Catat di Beranda atau halaman Uang.
      </p>
    </div>
  );
}
