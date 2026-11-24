import { describe, expect, it } from 'vitest';
import { encodeWav, pickMime, rmsOfBytes } from './recorder';

describe('pickMime', () => {
  it('webm/opus di Chrome, mp4 di Safari, kosong bila tidak ada', () => {
    expect(pickMime((t) => t.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(pickMime((t) => t === 'audio/mp4')).toBe('audio/mp4');
    expect(pickMime(() => false)).toBe('');
    expect(pickMime(() => { throw new Error('x'); })).toBe('');
  });
});

describe('encodeWav', () => {
  it('header WAV PCM 16-bit mono 16 kHz', async () => {
    const blob = encodeWav(new Float32Array([0, 1, -1, 0.5]));
    expect(blob.type).toBe('audio/wav');
    const v = new DataView(await blob.arrayBuffer());
    const str = (o: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => v.getUint8(o + i)));
    expect([str(0), str(8), str(12), str(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(8);
    expect([v.getInt16(46, true), v.getInt16(48, true)]).toEqual([32767, -32768]);
  });
});

describe('rmsOfBytes', () => {
  it('diam (128) = 0, ayunan penuh mendekati 1', () => {
    expect(rmsOfBytes(new Uint8Array(64).fill(128))).toBe(0);
    expect(rmsOfBytes(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 0 : 255)))).toBeGreaterThan(0.95);
  });
});
