// Semua perhitungan tanggal memakai zona aplikasi (default Asia/Jakarta), bukan jam perangkat.

export const APP_TIMEZONE = process.env.APP_TIMEZONE || process.env.NEXT_PUBLIC_APP_TIMEZONE || 'Asia/Jakarta';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isHhmm(s: unknown): s is string {
  return typeof s === 'string' && TIME_RE.test(s);
}

/** Selisih menit zona `tz` terhadap UTC pada instan tertentu (Asia/Jakarta = +420). */
export function tzOffsetMinutes(instant: Date, tz = APP_TIMEZONE): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** Tanggal + jam lokal zona aplikasi menjadi ISO UTC. */
export function zonedToIso(date: string, time = '00:00', tz = APP_TIMEZONE): string {
  if (!isIsoDate(date)) throw new Error(`Tanggal tidak valid: ${date}`);
  if (!isHhmm(time)) throw new Error(`Jam tidak valid: ${time}`);
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off = tzOffsetMinutes(new Date(guess), tz);
  return new Date(guess - off * 60000).toISOString();
}

/** Bagian tanggal (YYYY-MM-DD) dan jam (HH:MM) sebuah instan menurut zona aplikasi. */
export function zonedParts(instant: Date | string, tz = APP_TIMEZONE): { date: string; time: string } {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

export function todayIso(now: Date = new Date(), tz = APP_TIMEZONE): string {
  return zonedParts(now, tz).date;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function addMinutesToIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

export function diffDays(a: string, b: string): number {
  const toUtc = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toUtc(a) - toUtc(b)) / 864e5);
}

/** 1 = Senin ... 7 = Minggu */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export const WEEKDAYS_ID = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

export function formatDateId(value: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  if (!value) return '';
  const instant = isIsoDate(value) ? new Date(zonedToIso(value, '12:00')) : new Date(value);
  return new Intl.DateTimeFormat('id-ID', { timeZone: APP_TIMEZONE, ...opts }).format(instant);
}

export function formatDateTimeId(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: APP_TIMEZONE, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

export function relativeDay(date: string, today = todayIso()): string {
  const d = diffDays(date, today);
  if (d === 0) return 'hari ini';
  if (d === 1) return 'besok';
  if (d === -1) return 'kemarin';
  return d > 0 ? `${d} hari lagi` : `${-d} hari lalu`;
}
