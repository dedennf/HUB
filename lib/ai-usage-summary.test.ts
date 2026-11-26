import { describe, expect, it } from 'vitest';
import { summarizeUsage } from './ai-usage-summary';
import { readDailyLimit, usageFrom } from './ai-usage';

describe('summarizeUsage', () => {
  const now = new Date('2026-11-26T05:00:00Z'); // 12.00 WIB
  it('menjumlah per hari WIB dan per fitur hari ini', () => {
    const s = summarizeUsage([
      { created_at: '2026-11-25T18:30:00Z', feature: 'agent', total_tokens: 100, ok: true }, // 01.30 WIB tgl 26
      { created_at: '2026-11-26T04:00:00Z', feature: 'english', total_tokens: 300, ok: true },
      { created_at: '2026-11-25T10:00:00Z', feature: 'agent', total_tokens: 50, ok: true }, // tgl 25
    ], now, 3);
    expect(s.daily.map((d) => [d.date, d.tokens])).toEqual([['2026-11-24', 0], ['2026-11-25', 50], ['2026-11-26', 400]]);
    expect(s.today).toEqual([{ feature: 'english', tokens: 300, calls: 1 }, { feature: 'agent', tokens: 100, calls: 1 }]);
  });
});

describe('usageFrom dan readDailyLimit', () => {
  it('menghitung token berpikir sebagai keluaran', () => {
    expect(usageFrom('m', { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 7, totalTokenCount: 22 })).toEqual({ model: 'm', input_tokens: 10, output_tokens: 12, total_tokens: 22, ok: true });
    expect(usageFrom('m', undefined).total_tokens).toBe(0);
  });
  it('batas tidak valid berarti tanpa batas', () => {
    expect(readDailyLimit('abc')).toBe(0);
    expect(readDailyLimit(-5)).toBe(0);
    expect(readDailyLimit(50000)).toBe(50000);
  });
});
