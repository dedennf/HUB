import { describe, expect, it } from 'vitest';
import { fitSize } from './client';
import { buildPrompt, EXTRACTION_JSON_SCHEMA, parseExtraction } from './extract';
import { itemsNote, receiptTime } from './propose';

describe('parseExtraction', () => {
  it('membersihkan angka bergaya rupiah, membulatkan, dan mengisi bawaan', () => {
    const x = parseExtraction('```json\n{"doc_type":"receipt","merchant":"  Kopi Kenangan ","total":"Rp 25.500","tax":2318.18,"items":[{"name":"Es kopi","price":"18.000"}],"confidence":1.4}\n```');
    expect(x).toMatchObject({ doc_type: 'receipt', merchant: 'Kopi Kenangan', total: 25500, tax: 2318, currency: 'IDR', confidence: 1, payment_method: null });
    expect(x.items).toEqual([{ name: 'Es kopi', qty: null, price: 18000 }]);
  });
  it('doc_type tak dikenal jadi unknown, total kosong jadi null', () => {
    const x = parseExtraction('{"doc_type":"nota","total":null,"confidence":"0.3"}');
    expect(x).toMatchObject({ doc_type: 'unknown', total: null, confidence: 0.3, items: [] });
  });
  it('JSON rusak dilempar sebagai galat', () => {
    expect(() => parseExtraction('bukan json')).toThrow();
  });
});

describe('prompt dan skema', () => {
  it('skema meminta field SPEC 7.2', () => {
    expect(Object.keys(EXTRACTION_JSON_SCHEMA.properties)).toEqual(expect.arrayContaining(['doc_type', 'merchant', 'occurred_at', 'items', 'total', 'payment_method', 'from_account_hint', 'to_account_hint', 'confidence']));
  });
  it('prompt memuat akun dan kategori pengguna', () => {
    const p = buildPrompt(['Makan & minum', 'Transportasi'], ['BCA', 'GoPay']);
    expect(p).toContain('BCA, GoPay');
    expect(p).toContain('Makan & minum, Transportasi');
  });
});

describe('receiptTime', () => {
  const now = new Date('2026-11-24T03:00:00Z'); // 10.00 WIB
  it('waktu lokal di struk dibaca sebagai WIB', () => {
    expect(receiptTime('2026-11-23T19:30', now)).toEqual({ iso: '2026-11-23T12:30:00.000Z', suspicious: false });
    expect(receiptTime('2026-11-23 19:30:12', now).iso).toBe('2026-11-23T12:30:00.000Z');
    expect(receiptTime('2026-11-20', now).iso).toBe('2026-11-20T05:00:00.000Z');
  });
  it('tanggal masa depan atau terlalu lama dianggap salah baca', () => {
    expect(receiptTime('2027-01-05T10:00', now)).toEqual({ iso: undefined, suspicious: true });
    expect(receiptTime('2024-01-05T10:00', now)).toEqual({ iso: undefined, suspicious: true });
    expect(receiptTime(null, now)).toEqual({ iso: undefined, suspicious: false });
  });
});

describe('itemsNote dan fitSize', () => {
  it('ringkas daftar item', () => {
    const base = parseExtraction('{"doc_type":"receipt","total":1,"confidence":1,"items":[{"name":"A"},{"name":"B"},{"name":"C"},{"name":"D"},{"name":"E"},{"name":"F"}]}');
    expect(itemsNote(base)).toBe('A, B, C, D, +2 lainnya');
  });
  it('sisi terpanjang maksimal 1600, gambar kecil tidak diperbesar', () => {
    expect(fitSize(4000, 3000)).toEqual({ w: 1600, h: 1200 });
    expect(fitSize(1080, 2400)).toEqual({ w: 720, h: 1600 });
    expect(fitSize(800, 600)).toEqual({ w: 800, h: 600 });
  });
});

describe('gambar bukan struk (D-72)', () => {
  it('doc_type other diterima dan prompt menjelaskannya', () => {
    expect(parseExtraction('{"doc_type":"other","total":null,"confidence":1}').doc_type).toBe('other');
    expect(buildPrompt([], [])).toMatch(/BUKAN dokumen keuangan[\s\S]*"other"/);
  });
});
