import { describe, expect, it } from 'vitest';
import { formatDayShort, formatPercent, formatRp, formatRpShort, formatTime, greeting, initials } from './format';

describe('format (DESIGN 2.4)', () => {
  it('rupiah penuh tanpa spasi', () => {
    expect(formatRp(3825000)).toBe('Rp3.825.000');
    expect(formatRp(0)).toBe('Rp0');
    expect(formatRp(-28189)).toBe('−Rp28.189');
    expect(formatRp(740000, { sign: true })).toBe('+Rp740.000');
  });
  it('rupiah ringkas', () => {
    expect(formatRpShort(620000)).toBe('Rp620rb');
    expect(formatRpShort(1200000)).toBe('Rp1,2jt');
    expect(formatRpShort(3000000)).toBe('Rp3jt');
    expect(formatRpShort(150000)).toBe('Rp150rb');
    expect(formatRpShort(500)).toBe('Rp500');
  });
  it('persen dengan koma', () => {
    expect(formatPercent(0.038)).toBe('3,8%');
    expect(formatPercent(0.4)).toBe('40%');
    expect(formatPercent(-0.024)).toBe('2,4%');
  });
  it('jam dan tanggal', () => {
    expect(formatTime('08:00:00')).toBe('08.00');
    expect(formatDayShort('2026-11-21')).toBe('Sabtu, 21 Nov');
  });
  it('inisial dan sapaan', () => {
    expect(initials('BCA')).toBe('BC');
    expect(initials('Reksa dana')).toBe('RD');
    expect(initials('GoPay')).toBe('GP');
    expect(initials('Tunai')).toBe('TN');
    expect(greeting(6)).toBe('Selamat pagi');
    expect(greeting(20)).toBe('Selamat malam');
  });
});
