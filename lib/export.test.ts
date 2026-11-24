import { describe, expect, it } from 'vitest';
import { stripUser, transactionsCsv } from './export';
import { zonedParts } from './time';

describe('export', () => {
  it('membuang user_id', () => {
    expect(stripUser([{ id: 'a', user_id: 'u', name: 'x' }])).toEqual([{ id: 'a', name: 'x' }]);
  });
  it('CSV transaksi dengan nama akun, kategori, dan tanda kutip aman', () => {
    const csv = transactionsCsv(
      [{ occurred_at: '2026-11-14T05:00:00Z', kind: 'expense', amount: 12900, account_id: 'a', to_account_id: null, category_id: 'c', subcategory: null, note: 'kopi "susu"', source: 'manual' }],
      new Map([['a', 'BCA']]), new Map([['c', 'Makan & minum']]), (iso) => zonedParts(iso),
    );
    const [head, line] = csv.replace('﻿', '').split('\n');
    expect(head).toBe('tanggal,jam,jenis,nominal,akun,ke_akun,kategori,sub_kategori,catatan,sumber');
    expect(line).toBe('2026-11-14,12:00,keluar,12900,"BCA","","Makan & minum","","kopi ""susu""",manual');
  });
});
