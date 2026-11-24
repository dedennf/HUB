import { describe, expect, it } from 'vitest';
import { memoryKey } from './actions';
import { cardFor, type ActionRow, type Lookups } from './cards';

const lk: Lookups = {
  accounts: [{ id: 'a1', name: 'GoPay' }, { id: 'a2', name: 'BCA' }],
  categories: [{ id: 'c1', name: 'Transportasi', kind: 'expense' }, { id: 'c2', name: 'Gaji', kind: 'income' }],
  courses: [{ id: 'k1', name: 'Perencanaan Kota' }],
};
const today = '2026-11-24';
const row = (p: Partial<ActionRow>): ActionRow => ({ id: 'x', tool_name: 'add_transaction', summary: 'S', permission: 'write', status: 'proposed', args: {}, result: null, ...p });

describe('cardFor', () => {
  it('transaksi: chip kategori, akun, tanggal bisa diubah, yang ditebak ditandai', () => {
    const c = cardFor(row({ args: { kind: 'expense', amount: 30000, category_id: 'c1', account_id: 'a1', note: 'bensin', occurred_at: '2026-11-24T05:00:00.000Z' }, result: { doubtful: ['account'], warning: 'Akun ditebak.' } }), lk, today);
    expect(c).toMatchObject({ icon: 'expense', kindLabel: 'Pengeluaran', value: 'Rp30.000', destructive: false });
    expect(c.chips).toEqual([
      { label: 'Transportasi', doubtful: false, field: 'category', edit: 'category_expense', value: 'c1' },
      { label: 'GoPay', doubtful: true, field: 'account', edit: 'account', value: 'a1' },
      { label: 'Hari ini', doubtful: false, field: 'occurred_at', edit: 'date', value: '2026-11-24' },
    ]);
    expect(c.note).toBe('Catatan: bensin. Akun ditebak.');
  });

  it('transfer dan tugas', () => {
    const t = cardFor(row({ tool_name: 'add_transfer', args: { amount: 500000, from: 'a2', to: 'a1', fee: 2500, occurred_at: '2026-11-23T05:00:00.000Z' } }), lk, today);
    expect(t.chips.map((x) => x.label)).toEqual(['BCA', 'ke GoPay', 'Kemarin']);
    expect(t.note).toMatch(/Rp2\.500/);
    const k = cardFor(row({ tool_name: 'add_task', args: { title: 'Laporan', kind: 'exam', course_id: 'k1', due_at: '2026-11-27T16:59:00.000Z' } }), lk, today);
    expect(k).toMatchObject({ kindLabel: 'Ujian baru', value: 'Laporan' });
    expect(k.chips[1]).toMatchObject({ field: 'due_at', edit: 'datetime', value: '2026-11-27T23:59' });
    expect(k.chips[1].label).toMatch(/23\.59$/);
  });

  it('destruktif: ikon hapus dan peringatan bawaan', () => {
    const c = cardFor(row({ tool_name: 'delete_transaction', permission: 'destructive', summary: 'Hapus: Pengeluaran Rp30.000 · GoPay' }), lk, today);
    expect(c).toMatchObject({ destructive: true, icon: 'delete', kindLabel: 'Hapus transaksi', value: 'Hapus: Pengeluaran Rp30.000' });
    expect(c.note).toMatch(/menghapus/);
  });
});

describe('memoryKey', () => {
  it('merchant dulu, catatan pendek, catatan panjang diabaikan', () => {
    expect(memoryKey('Pertamina', 'bensin')).toBe('pertamina');
    expect(memoryKey(null, 'Makan Siang')).toBe('makan siang');
    expect(memoryKey(null, 'beli buku untuk kuliah besok pagi')).toBeNull();
  });
});

describe('cardFor dari struk', () => {
  it('nominal meragukan memunculkan chip "Cek nominal" yang bisa diubah, tanggal ikut ditandai', () => {
    const c = cardFor(row({ args: { kind: 'expense', amount: 25500, category_id: 'c1', account_id: 'a1', merchant: 'Indomaret', occurred_at: '2026-11-24T05:00:00.000Z', receipt_id: 'r1' }, result: { doubtful: ['amount', 'date'], warning: 'Struk kurang jelas.' } }), lk, today);
    expect(c.chips.at(-1)).toEqual({ label: 'Cek nominal', doubtful: true, field: 'amount', edit: 'amount', value: '25500' });
    expect(c.chips[2].doubtful).toBe(true);
    expect(c.warn).toBe(true);
  });
});
