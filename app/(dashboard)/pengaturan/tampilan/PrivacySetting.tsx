'use client';
import { usePrivacy } from '@/components/providers/PrivacyProvider';


export function PrivacySetting() {
  const { hidden, toggle } = usePrivacy();
  return (
    <div className="card flex min-h-[64px] items-center gap-3 p-4">
      <span className="flex-1">
        <span className="block text-[14px] font-semibold">Sembunyikan saldo</span>
        <span className="block text-[12px] text-muted">Saldo dan kekayaan bersih tampil Rp••••••• di semua halaman. Nominal transaksi tetap terlihat. Berlaku di perangkat ini saja.</span>
      </span>
      <button type="button" role="switch" aria-checked={hidden} onClick={toggle} aria-label="Sembunyikan saldo"
        className="inline-flex h-11 w-16 shrink-0 items-center justify-center">
        <span className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${hidden ? 'bg-accent-fill' : 'bg-track'}`}>
          <span className={`inline-block h-6 w-6 rounded-full bg-surface shadow transition-transform ${hidden ? 'translate-x-7' : 'translate-x-1'}`} />
        </span>
      </button>
    </div>
  );
}
