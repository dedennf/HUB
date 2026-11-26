import { describe, expect, it } from 'vitest';
import { countMissing, kompasBackup, prepareRestore } from './restore';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

describe('prepareRestore', () => {
  const backup = kompasBackup.parse({
    app: 'kompas', version: 1, exported: '2026-11-22T19:30:00Z',
    data: {
      categories: [{ id: id(1), slug: 'food', name: 'Makan' }, { id: id(2), slug: null, name: 'Kopi' }],
      transactions: [{ id: id(10), category_id: id(1), receipt_id: id(99) }, { id: id(11), category_id: id(2) }],
      bills: [{ id: id(20), category_id: id(1) }],
      semesters: [{ id: id(30), is_active: true }],
      tabel_asing: [{ id: id(40) }],
      tasks: [{ title: 'tanpa id' }],
    },
  });

  it('memetakan kategori bawaan lewat slug, membuang receipt_id, menjaga satu semester aktif', () => {
    const p = prepareRestore(backup, { categoryBySlug: new Map([['food', id(100)]]), activeSemesterId: id(31) });
    expect(p.tables.categories).toEqual([{ id: id(2), slug: null, name: 'Kopi' }]);
    expect(p.mergedCategories).toBe(1);
    expect(p.tables.transactions).toEqual([{ id: id(10), category_id: id(100), receipt_id: null }, { id: id(11), category_id: id(2), receipt_id: null }]);
    expect(p.tables.bills![0].category_id).toBe(id(100));
    expect(p.tables.semesters![0].is_active).toBe(false);
    expect(p.ignored).toEqual(['tabel_asing']);
    expect(p.tables.tasks).toBeUndefined();
  });

  it('kategori dengan id sama tidak dipetakan, semester aktif tetap bila belum ada yang aktif', () => {
    const p = prepareRestore(backup, { categoryBySlug: new Map([['food', id(1)]]), activeSemesterId: null });
    expect(p.tables.categories).toHaveLength(2);
    expect(p.mergedCategories).toBe(0);
    expect(p.tables.semesters![0].is_active).toBe(true);
  });

  it('menolak file yang bukan cadangan Kompas', () => {
    expect(kompasBackup.safeParse({ app: 'hub', data: {} }).success).toBe(false);
  });

  it('menghitung baris yang belum ada', () => {
    const p = prepareRestore(backup, { categoryBySlug: new Map(), activeSemesterId: null });
    expect(countMissing(p.tables, { transactions: new Set([id(10)]) }).transactions).toEqual({ total: 2, missing: 1 });
  });
});
