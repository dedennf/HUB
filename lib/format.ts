// Format angka dan teks sesuai docs/DESIGN.md 2.4.
import { APP_TIMEZONE, isIsoDate, zonedToIso } from './time';

const MINUS = '−'; // tanda minus tipografis

function thousands(n: number): string {
  return Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Rp3.825.000 (tanpa spasi, titik ribuan). Negatif: −Rp3.825.000. */
export function formatRp(n: number | null | undefined, opts: { sign?: boolean } = {}): string {
  const v = Math.round(Number(n) || 0);
  const prefix = v < 0 ? MINUS : opts.sign && v > 0 ? '+' : '';
  return `${prefix}Rp${thousands(v)}`;
}

/** Ringkas: Rp500, Rp620rb, Rp1,2jt, Rp3,4M. */
export function formatRpShort(n: number | null | undefined): string {
  const v = Math.round(Number(n) || 0);
  const a = Math.abs(v);
  const sign = v < 0 ? MINUS : '';
  const dec = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',').replace(/,0$/, '');
  if (a >= 1e9) return `${sign}Rp${dec(a / 1e9)}M`;
  if (a >= 1e6) return `${sign}Rp${dec(a / 1e6)}jt`;
  if (a >= 1e3) return `${sign}Rp${Math.round(a / 1e3)}rb`;
  return `${sign}Rp${a}`;
}

/** 0.038 → "3,8%". */
export function formatPercent(ratio: number, digits = 1): string {
  const v = Math.round(Math.abs(ratio) * 100 * 10 ** digits) / 10 ** digits;
  return `${v.toFixed(digits).replace('.', ',').replace(/,0+$/, '')}%`;
}

/** "08:00" atau "08:00:00" → "08.00". */
export function formatTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5).replace(':', '.') : '';
}

const instant = (value: string) => (isIsoDate(value) ? new Date(zonedToIso(value, '12:00')) : new Date(value));

/** "Sabtu, 21 Nov" */
export function formatDayShort(value: string): string {
  const d = instant(value);
  const wd = new Intl.DateTimeFormat('id-ID', { timeZone: APP_TIMEZONE, weekday: 'long' }).format(d);
  const dm = new Intl.DateTimeFormat('id-ID', { timeZone: APP_TIMEZONE, day: 'numeric', month: 'short' }).format(d).replace('.', '');
  return `${wd}, ${dm}`;
}

/** "21 Nov" */
export function formatDayMonth(value: string): string {
  return new Intl.DateTimeFormat('id-ID', { timeZone: APP_TIMEZONE, day: 'numeric', month: 'short' }).format(instant(value)).replace('.', '');
}

/** "November 2026" */
export function formatMonthYear(value: string): string {
  return new Intl.DateTimeFormat('id-ID', { timeZone: APP_TIMEZONE, month: 'long', year: 'numeric' }).format(instant(value));
}

/** Inisial dua huruf seperti mockup: huruf pertama + konsonan berikutnya (BCA jadi BC, GoPay jadi GP, Tunai jadi TN), atau huruf awal dua kata (Reksa dana jadi RD). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const w = words[0] ?? '?';
  const next = w.slice(1).match(/[b-df-hj-np-tv-z]/i)?.[0] ?? w[1] ?? '';
  return (w[0] + next).toUpperCase();
}

/** Sapaan menurut jam di zona aplikasi. */
export function greeting(hour: number): string {
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}
