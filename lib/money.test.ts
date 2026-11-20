import { describe, expect, it } from 'vitest';
import { formatRupiah, parseRupiah, toRupiahInt } from './money';

describe('money', () => {
  it('membulatkan ke rupiah', () => {
    expect(toRupiahInt(1234567.89)).toBe(1234568);
    expect(toRupiahInt('abc')).toBe(0);
  });
  it('format rupiah', () => {
    expect(formatRupiah(1500000)).toBe('Rp 1.500.000');
    expect(formatRupiah(-2500)).toBe('-Rp 2.500');
  });
  it('membaca input nominal', () => {
    expect(parseRupiah('30rb')).toBe(30000);
    expect(parseRupiah('30k')).toBe(30000);
    expect(parseRupiah('1,2 jt')).toBe(1200000);
    expect(parseRupiah('1.5jt')).toBe(1500000);
    expect(parseRupiah('1.500.000')).toBe(1500000);
    expect(parseRupiah('Rp 25.000')).toBe(25000);
    expect(parseRupiah('goceng')).toBe(5000);
    expect(parseRupiah('ceban')).toBe(10000);
    expect(parseRupiah('')).toBeNull();
    expect(parseRupiah('dua ribu')).toBeNull();
  });
});
