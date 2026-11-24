import { describe, expect, it } from 'vitest';
import { base64ToPcm16, bytesToBase64, rateOf, toPcm16 } from './audio';
import { englishSystem } from './config';

describe('audio Live', () => {
  it('48 kHz → 16 kHz PCM 16-bit, nilai terpotong di -1..1', () => {
    const f = new Float32Array(480).fill(0.5);
    f[0] = 2;
    const out = toPcm16(f, 48_000);
    expect(out.length).toBe(160);
    expect(Math.abs(out[5] - 16383)).toBeLessThanOrEqual(1);
    expect(toPcm16(new Float32Array([-1, -1, -1]), 16_000)[0]).toBe(-32768);
  });
  it('base64 bolak-balik dan laju dari mimeType', () => {
    const pcm = new Int16Array([0, 1000, -1000, 32767]);
    expect([...base64ToPcm16(bytesToBase64(new Uint8Array(pcm.buffer)))]).toEqual([0, 1000, -1000, 32767]);
    expect(rateOf('audio/pcm;rate=24000')).toBe(24000);
    expect(rateOf('audio/pcm')).toBe(24000);
  });
});

describe('instruksi percakapan bahasa Inggris', () => {
  it('menyesuaikan level, tingkat koreksi, dan pola kesalahan', () => {
    const s = englishSystem({ level: 'beginner', goal: 'conversation', correction: 'off', topMistakes: ['verb tense'] }, 'Riset');
    expect(s).toMatch(/beginner \(A2\)/);
    expect(s).toMatch(/Do not correct/);
    expect(s).toMatch(/verb tense/);
    expect(s).toMatch(/topic: Riset/);
    expect(englishSystem({ level: 'intermediate', goal: 'academic_general', correction: 'important_only', topMistakes: [] })).toMatch(/clear mistake/);
  });
});
