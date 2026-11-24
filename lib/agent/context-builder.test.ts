import { describe, expect, it } from 'vitest';
import { buildSnapshot, buildSystemPrompt, formatMemory, selectMemory, type ContextData } from './context-builder';

const base: ContextData = {
  now: new Date('2026-11-24T03:15:00Z'), today: '2026-11-24',
  accounts: [{ id: 'a1', name: 'BCA', type: 'bank', aliases: ['atm biru'], balance: 3_000_000 }, { id: 'a2', name: 'Reksa', type: 'investment', aliases: [], balance: 1_000_000 }],
  categories: [{ id: 'c1', name: 'Makan & minum', kind: 'expense', monthly_budget: 800_000, is_hidden: false }, { id: 'c2', name: 'Gaji', kind: 'income', monthly_budget: null, is_hidden: false }],
  courses: [{ id: 'k1', name: 'Statistika', alias: 'STAT', code: null }],
  projects: [{ id: 'p1', title: 'Skripsi', status: 'active' }],
  monthSpend: { c1: 620_000 }, bills: [{ name: 'Wifi', amount: 125_000, next_due_date: '2026-11-27' }],
  classesToday: [{ course: 'Statistika', start: '08:00', end: '09:40', location: 'B2' }], classesTomorrow: [],
  tasks: [{ title: 'Laporan', due_at: '2026-11-27T16:59:00Z', course: 'Statistika', kind: 'assignment' }],
  targets: [{ title: 'Bab II', progress: 25, last_touched_at: '2026-11-18T03:00:00Z', due_date: null }],
  vocabDue: 12, studyStreak: 3, englishMode: false,
};

describe('konteks agen', () => {
  it('konteks sistem: tanggal WIB, hari, akun dan alias, kategori, aturan', () => {
    const s = buildSystemPrompt(base);
    expect(s).toContain('Selasa, 2026-11-24 pukul 10:15 WIB');
    expect(s).toContain('BCA (bank; alias: atm biru)');
    expect(s).toContain('KATEGORI PENGELUARAN: Makan & minum');
    expect(s).toContain('Statistika (STAT)');
    expect(s).toContain('add_transfer');
    expect(s).toContain('Jangan mengarang angka');
    expect(s).not.toContain('English Mode aktif');
    expect(buildSystemPrompt({ ...base, englishMode: true })).toContain('English Mode aktif');
  });
  it('snapshot ringkas berisi saldo, budget, tagihan, kuliah, tugas, riset, kosakata', () => {
    const s = buildSnapshot(base);
    expect(s).toContain('Uang siap pakai Rp3.000.000');
    expect(s).toContain('Makan & minum Rp620.000/Rp800.000');
    expect(s).toContain('Wifi Rp125.000 2026-11-27');
    expect(s).toContain('08:00-09:40 Statistika (B2)');
    expect(s).toContain('Laporan [Statistika] 2026-11-27');
    expect(s).toContain('Bab II 25% (6 hari tak disentuh)');
    expect(s).toContain('Kosakata jatuh tempo: 12');
  });
  it('snapshot tetap di bawah ~1.500 token walau data banyak', () => {
    const many: ContextData = {
      ...base,
      accounts: Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, name: `Akun ${i}`, type: 'bank', aliases: [], balance: 1_234_567 })),
      categories: Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, name: `Kategori panjang ${i}`, kind: 'expense', monthly_budget: 500_000, is_hidden: false })),
      tasks: Array.from({ length: 40 }, (_, i) => ({ title: `Tugas dengan judul yang cukup panjang ${i}`, due_at: '2026-11-30T16:59:00Z', course: 'Mata kuliah panjang', kind: 'assignment' })),
      targets: Array.from({ length: 20 }, (_, i) => ({ title: `Target ${i}`, progress: 10, last_touched_at: null, due_date: null })),
    };
    expect(buildSnapshot(many).length / 4).toBeLessThan(1500);
  });
  it('memori: alias selalu, merchant_rule hanya bila katanya ada di input', () => {
    const mem = [
      { id: '1', kind: 'alias', key: 'atm kuning', value: { account_id: 'a1' } },
      { id: '2', kind: 'merchant_rule', key: 'indomaret', value: { category_id: 'c1' } },
      { id: '3', kind: 'merchant_rule', key: 'pertamina', value: { category_id: 'c1' } },
    ];
    const sel = selectMemory(mem, 'beli sabun di Indomaret 20rb');
    expect(sel.map((m) => m.id)).toEqual(['1', '2']);
    expect(formatMemory(sel, new Map([['a1', 'BCA'], ['c1', 'Makan & minum']]))).toBe('MEMORI:\n- alias "atm kuning" → BCA\n- merchant_rule "indomaret" → Makan & minum');
  });
});
