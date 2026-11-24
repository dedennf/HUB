// Waktu untuk otomasi (SPEC 8.1, 8.3): jadwal cron dan jam tenang, selalu di zona Asia/Jakarta (UTC+7, tanpa DST).
import { CronExpressionParser } from 'cron-parser';

export const TZ = 'Asia/Jakarta';
const OFFSET_MIN = 7 * 60;

/** Menit sejak tengah malam WIB. */
export function wibMinutes(d: Date): number {
  return (d.getUTCHours() * 60 + d.getUTCMinutes() + OFFSET_MIN) % 1440;
}

export function parseHhmm(v: unknown, fallback: string): number {
  const s = typeof v === 'string' && /^\d{1,2}[:.]\d{2}$/.test(v.trim()) ? v.trim() : fallback;
  const [h, m] = s.split(/[:.]/).map(Number);
  return (h % 24) * 60 + (m % 60);
}

/** "06:30" → cron "30 6 * * *" (harian). */
export function dailyCron(hhmm: unknown, fallback: string): string {
  const m = parseHhmm(hhmm, fallback);
  return `${m % 60} ${Math.floor(m / 60)} * * *`;
}

/** Waktu jalan berikutnya setelah `from`. null bila cron tidak sah. */
export function nextCronRun(cron: string, from: Date): Date | null {
  try {
    return CronExpressionParser.parse(cron, { tz: TZ, currentDate: from }).next().toDate();
  } catch {
    return null;
  }
}

export type Quiet = [number, number] | null;

export function readQuiet(v: unknown): Quiet {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const s = parseHhmm(v[0], ''), e = parseHhmm(v[1], '');
  return Number.isNaN(s) || Number.isNaN(e) || s === e ? null : [s, e];
}

/** Jam tenang bisa melewati tengah malam (22.30 sampai 06.00). */
export function inQuiet(d: Date, q: Quiet): boolean {
  if (!q) return false;
  const m = wibMinutes(d);
  const [s, e] = q;
  return s < e ? m >= s && m < e : m >= s || m < e;
}

/** Akhir jam tenang yang sedang berlangsung (atau berikutnya). */
export function quietEndAfter(d: Date, q: Exclude<Quiet, null>): Date {
  const m = wibMinutes(d);
  let diff = q[1] - m;
  if (diff <= 0) diff += 1440;
  const t = new Date(d.getTime() + diff * 60_000);
  t.setUTCSeconds(0, 0);
  return t;
}

/**
 * Kapan notifikasi boleh dikirim (SPEC 8.1): di luar jam tenang langsung (null). Di dalam jam tenang ditunda
 * ke akhir jam tenang, kecuali peristiwanya (mis. tenggat) jatuh di dalam jam tenang itu sendiri.
 */
export function deliverAfter(now: Date, q: Quiet, eventAt?: Date | null): Date | null {
  if (!q || !inQuiet(now, q)) return null;
  const end = quietEndAfter(now, q);
  if (eventAt && eventAt.getTime() <= end.getTime()) return null;
  return end;
}
