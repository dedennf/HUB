import { describe, expect, it } from 'vitest';
import { matchName, normalize } from './resolve';

const accounts = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'BCA', aliases: ['atm biru', 'rekening utama'] },
  { id: '22222222-2222-4222-8222-222222222222', name: 'BRI', aliases: ['atm kuning'] },
  { id: '33333333-3333-4333-8333-333333333333', name: 'GoPay', aliases: [] },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Bank Jago', aliases: [] },
];

describe('resolve', () => {
  it('normalisasi', () => {
    expect(normalize('  GoPay! ')).toBe('gopay');
    expect(normalize('Jum’at')).toBe('jum at');
  });
  it('nama dan alias persis', () => {
    expect(matchName('bca', accounts)).toMatchObject({ kind: 'found', label: 'BCA' });
    expect(matchName('ATM Kuning', accounts)).toMatchObject({ kind: 'found', label: 'BRI' });
    expect(matchName('gopay', accounts)).toMatchObject({ kind: 'found', label: 'GoPay' });
  });
  it('id langsung', () => {
    expect(matchName('33333333-3333-4333-8333-333333333333', accounts)).toMatchObject({ kind: 'found', label: 'GoPay' });
  });
  it('awalan dan mengandung', () => {
    expect(matchName('jago', accounts)).toMatchObject({ kind: 'found', label: 'Bank Jago' });
    expect(matchName('rekening', accounts)).toMatchObject({ kind: 'found', label: 'BCA' });
  });
  it('ambigu mengembalikan kandidat, tidak menebak', () => {
    const r = matchName('atm', accounts);
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.candidates.map((c) => c.label).sort()).toEqual(['BCA', 'BRI']);
  });
  it('tidak ditemukan', () => {
    expect(matchName('mandiri', accounts)).toEqual({ kind: 'not_found' });
    expect(matchName('', accounts)).toEqual({ kind: 'not_found' });
  });
});
