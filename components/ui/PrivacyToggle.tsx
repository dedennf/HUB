'use client';
import { Eye, EyeOff } from 'lucide-react';
import { usePrivacy } from '@/components/providers/PrivacyProvider';

export function PrivacyToggle() {
  const { hidden, toggle } = usePrivacy();
  return (
    <button type="button" onClick={toggle} aria-pressed={hidden} aria-label={hidden ? 'Tampilkan saldo' : 'Sembunyikan saldo'}
      className="-my-3 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-fg">
      {hidden ? <EyeOff size={18} strokeWidth={1.8} aria-hidden="true" /> : <Eye size={18} strokeWidth={1.8} aria-hidden="true" />}
    </button>
  );
}
