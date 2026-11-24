'use client';
import { useRa } from '@/components/providers/RaProvider';

/** "Buat dengan Ra" (SPEC 8.4): buka Ra dengan contoh kalimat di kolom input. */
export function AskRaButton() {
  const { openRa, inputRef } = useRa();
  return (
    <button type="button" className="btn btn-primary" onClick={() => {
      openRa();
      // sheet HP baru terpasang setelah dibuka: tunggu satu frame sebelum mengisi
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = inputRef.current ?? document.querySelector<HTMLInputElement>('dialog[open] input[name="ra-text"]');
        if (!el) return;
        el.value = 'Buat otomasi: setiap tanggal 5 catat bayar wifi 150 ribu dari GoPay';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.focus();
        el.select();
      }));
    }}>Buat dengan Ra</button>
  );
}
