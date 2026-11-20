import { describe, expect, it } from 'vitest';
import { accountInput, transactionInput } from './schemas';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('schemas', () => {
  it('transaksi: nominal gaya Indonesia dan jam default', () => {
    const r = transactionInput.parse({ kind: 'expense', amount: '30rb', account_id: A, to_account_id: '', category_id: '', date: '2026-11-21', time: '' });
    expect(r).toMatchObject({ amount: 30000, time: '12:00', to_account_id: null, category_id: null, note: null });
  });
  it('transfer wajib akun tujuan berbeda', () => {
    expect(transactionInput.safeParse({ kind: 'transfer', amount: '1000', account_id: A, to_account_id: A, date: '2026-11-21' }).success).toBe(false);
    expect(transactionInput.safeParse({ kind: 'transfer', amount: '1000', account_id: A, to_account_id: B, date: '2026-11-21' }).success).toBe(true);
  });
  it('nominal nol dan tanggal salah ditolak', () => {
    expect(transactionInput.safeParse({ kind: 'expense', amount: '0', account_id: A, date: '2026-11-21' }).success).toBe(false);
    expect(transactionInput.safeParse({ kind: 'expense', amount: '10', account_id: A, date: '2026-02-30' }).success).toBe(false);
  });
  it('akun: alias dan saldo awal', () => {
    expect(accountInput.parse({ name: ' BCA ', type: 'bank', opening_balance: '1,5jt', aliases: 'atm biru, biru', is_archived: undefined }))
      .toEqual({ name: 'BCA', type: 'bank', opening_balance: 1500000, aliases: ['atm biru', 'biru'], is_archived: false });
    expect(accountInput.parse({ name: 'Kartu', type: 'bank', opening_balance: '-50rb', aliases: '' }).opening_balance).toBe(-50000);
  });
});
