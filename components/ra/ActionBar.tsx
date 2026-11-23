/** Batal (sekunder) + Setujui semua (primer, dua kali lebar). */
export function ActionBar({ count, onCancel, onApprove, disabled }: { count: number; onCancel?: () => void; onApprove?: () => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <button type="button" className="btn" onClick={onCancel} disabled={disabled}>Batal</button>
      <button type="button" className="btn btn-primary col-span-2" onClick={onApprove} disabled={disabled}>
        {count > 1 ? `Setujui semua (${count})` : 'Setujui'}
      </button>
    </div>
  );
}
