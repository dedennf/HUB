import { describe, expect, it } from 'vitest';
import { brandDomain, groupNumber, shareText } from './brands';

describe('logo akun', () => {
  it('mengenali bank dan e-wallet umum dari nama atau alias', () => {
    expect(brandDomain('BCA Tahapan')).toBe('bca.co.id');
    expect(brandDomain('blu by BCA Digital')).toBe('blubybcadigital.id');
    expect(brandDomain('Mandiri')).toBe('bankmandiri.co.id');
    expect(brandDomain('GoPay')).toBe('gopay.co.id');
    expect(brandDomain('ShopeePay')).toBe('shopee.co.id');
    expect(brandDomain('DANA')).toBe('dana.id');
    expect(brandDomain('Tunai')).toBeNull();
    expect(brandDomain('Danamon')).toBe('danamon.co.id');
  });
  it('domain manual menang', () => {
    expect(brandDomain('Bank Raya', 'bankraya.co.id')).toBe('bankraya.co.id');
  });
});

describe('teks salin rekening', () => {
  it('format lengkap dan nomor dirapikan', () => {
    expect(shareText({ name: 'BCA', account_number: '123 456-7890', account_holder: 'Deden' })).toBe('BCA 1234567890 a.n. Deden');
    expect(shareText({ name: 'GoPay', account_number: '0812-3456-7890', account_holder: null })).toBe('GoPay 081234567890');
  });
  it('nomor dikelompokkan 4 digit', () => {
    expect(groupNumber('1234567890')).toBe('1234 5678 90');
    expect(groupNumber('+6281234')).toBe('+6281234'.replace(/(\d{4})(?=\d)/g, '$1 '));
  });
});
