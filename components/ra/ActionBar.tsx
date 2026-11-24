/** Batal (sekunder) + Setujui semua (primer, dua kali lebar). Aksi destruktif memakai tombol merah. */
export function ActionBar({ count, onCancel, onApprove, disabled, destructive = false }: {
  count: number; onCancel?: () => void; onApprove?: () => void; disabled?: boolean; destructive?: boolean;
}) {
  const label = destructive ? (count > 1 ? `Ya, jalankan semua (${count})` : 'Ya, jalankan') : count > 1 ? `Setujui semua (${count})` : 'Setujui';
  return (
    <div className="grid grid-cols-3 gap-3">
      <button type="button" className="btn" onClick={onCancel} disabled={disabled}>Batal</button>
      <button type="button" className={`btn col-span-2 ${destructive ? 'btn-danger' : 'btn-primary'}`} onClick={onApprove} disabled={disabled}>{label}</button>
    </div>
  );
}
