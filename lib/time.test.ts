import { describe, expect, it } from 'vitest';
import { addDays, diffDays, isIsoDate, isoWeekday, todayIso, zonedParts, zonedToIso } from './time';

describe('time (Asia/Jakarta)', () => {
  it('mengubah jam WIB ke UTC', () => {
    expect(zonedToIso('2026-11-21', '08:00', 'Asia/Jakarta')).toBe('2026-11-21T01:00:00.000Z');
    expect(zonedToIso('2026-11-14', '12:00', 'Asia/Jakarta')).toBe('2026-11-14T05:00:00.000Z');
  });
  it('tanggal hari ini mengikuti WIB, bukan UTC', () => {
    // 20 Nov 20:29 UTC = 21 Nov 03:29 WIB
    expect(todayIso(new Date('2026-11-20T20:29:16Z'), 'Asia/Jakarta')).toBe('2026-11-21');
    expect(zonedParts('2026-11-20T20:29:16Z', 'Asia/Jakarta').time).toBe('03:29');
  });
  it('validasi dan aritmetika tanggal', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-11-14')).toBe(true);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2026-11-17', '2026-11-14')).toBe(3);
    expect(isoWeekday('2026-11-16')).toBe(1); // Senin
    expect(isoWeekday('2026-11-22')).toBe(7); // Minggu
  });
});
