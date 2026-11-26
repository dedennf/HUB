import { describe, expect, it } from 'vitest';
import { IMAGE_DEFAULT_TEXT, imageTurn } from './core';

describe('imageTurn (D-72)', () => {
  const image = { data: Buffer.from('gambar'), mime: 'image/jpeg' };
  it('model menerima gambar, riwayat hanya penanda teks', () => {
    const t = imageTurn('  tugas Fotogrametri  ', image);
    expect(t.forModel.parts).toEqual([{ inlineData: { mimeType: 'image/jpeg', data: Buffer.from('gambar').toString('base64') } }, { text: '[gambar] tugas Fotogrametri' }]);
    expect(t.forHistory).toEqual({ role: 'user', parts: [{ text: '[gambar] tugas Fotogrametri' }] });
  });
  it('tanpa pesan memakai petunjuk bawaan', () => {
    expect(imageTurn('', image).forHistory.parts![0].text).toBe(`[gambar] ${IMAGE_DEFAULT_TEXT}`);
  });
});
