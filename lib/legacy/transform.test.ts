import { describe, expect, it } from 'vitest';
import { legacyBackup } from './schema';
import { transformLegacyBackup } from './transform';

// Data karangan, bukan data pengguna.
const fixture = {
  app: 'hub-pribadi',
  version: 1,
  exported: '2026-11-20T20:00:00.000Z',
  data: {
    settings: { sem: 3, semStart: '', semEnd: '', created: '2026-11-01', geminiNotes: 'rekening utama bank A' },
    accounts: [
      { id: 'acc1', name: 'Bank A', type: 'bank', alias: 'atm biru, biru', open: 100000.4, archived: false, _u: 1 },
      { id: 'acc2', name: 'Dompet', type: 'tunai', alias: '', open: 0, archived: false, _u: 1 },
    ],
    categories: [
      { id: 'o_makan', kind: 'out', name: 'Makan & minum', icon: '🍜', color: '#000', keywords: ['makan'], subs: [], hidden: false, builtin: true, order: 0, _u: 0 },
      { id: 'cust1', kind: 'out', name: 'Hobi', icon: '🎮', color: '#111', keywords: 'game, figure', subs: [], hidden: false, builtin: false, order: 14, _u: 1 },
    ],
    transactions: [
      { id: 't1', type: 'out', date: '2026-11-02', amount: 20000, acc: 'acc1', cat: 'o_makan', sub: '', note: 'nasi', _u: 1 },
      { id: 't2', type: 'tf', date: '2026-11-03', amount: 50000, acc: 'acc1', to: 'acc2', note: '', group: 'g1', _u: 1 },
      { id: 't3', type: 'out', date: '2026-11-03', amount: 2500, acc: 'acc1', cat: 'o_admin', note: 'Biaya admin', group: 'g1', _u: 1 },
      { id: 't4', type: 'out', date: '2024-11-05', amount: 9999, acc: 'acc1', cat: 'cust1', note: 'TOKO · barang', _u: 1 },
      { id: 't5', type: 'in', date: '2026-11-04', amount: 1000, acc: 'ghost', cat: 'i_lain', note: '', _u: 1 },
    ],
    budgets: [{ id: 'b1', cat: 'o_makan', limit: 800000, _u: 1 }],
    bills: [{ id: 'bill1', freq: 'bulanan', cat: 'o_makan', acc: '', active: true, nextDue: '2026-11-15', name: 'Kos', amount: 500000, note: '', _u: 1 }],
    debts: [{ id: 'd1', dir: 'piutang', person: 'Teman', amount: 100000, paid: 40000, date: '2026-11-01', due: '', note: '', _u: 1 }],
    courses: [{ id: 'c1', sem: 3, sks: 2, name: 'Statistika', alias: 'STAT', lecturer: 'Dosen', note: '', _u: 1 }],
    schedule: [
      { id: 's1', day: 0, start: '07:00', end: '08:40', course: 'c1', room: 'B2', _u: 1 },
      { id: 's2', day: 6, start: '10:00', end: '09:00', course: 'c1', room: '', _u: 1 },
    ],
    tasks: [
      { id: 'k1', kind: 'praktikum', prio: 'tinggi', done: false, course: 'c1', parent: '', title: 'Laporan', due: '2026-11-17', work: '2026-11-15', workStart: '10:15', workEnd: '', link: '', note: '', doneAt: '', _u: 1 },
      { id: 'k2', kind: 'tugas', prio: 'sedang', done: true, course: '', parent: 'k1', title: 'Bab 1', due: '', work: '', workStart: '', workEnd: '', link: '', note: '', doneAt: '2026-11-10', _u: 1 },
    ],
    ideas: [{ id: 'i1', status: 'mentah', title: 'Ide A', origin: 'Dosen', note: '', _u: 1 }],
    literature: [{ id: 'l1', title: 'Paper', authors: 'X', year: 2020, venue: '', doi: '10.1/abc', col: 'Koleksi', tags: ['a'], claim: '', st: 'doi', inc: 'pakai', note: '', ideas: ['i1'], ms: [], _u: 1 }],
    events: [{ id: 'e1', title: 'Acara', date: '2026-11-21', endDate: '2026-11-22', time: '08:00', endTime: '16:30', place: 'Gunung', repeat: 'tidak', until: '', note: '', _u: 1 }],
    recurring: [],
    focus: [],
  },
};

let seq = 0;
const ctx = () => ({
  existingMap: new Map<string, string>(),
  categoryBySlug: new Map([['o_makan', 'cat-makan'], ['o_admin', 'cat-admin'], ['i_lain', 'cat-lain']]),
  newId: () => `id-${++seq}`,
});

describe('transformLegacyBackup', () => {
  const backup = legacyBackup.parse(fixture);
  const r = transformLegacyBackup(backup, ctx());
  const tx = (legacyId: string) => {
    const id = r.payload.map.find((m) => m.source_table === 'transactions' && m.legacy_id === legacyId)?.new_id;
    return r.payload.tables.transactions.find((t) => t.id === id)!;
  };

  it('tidak ada pemblokir untuk koleksi kosong yang tak dikenal', () => {
    expect(r.blockers).toEqual([]);
  });

  it('akun: tipe, alias, pembulatan saldo awal', () => {
    const [a, b] = r.payload.tables.accounts;
    expect(a).toMatchObject({ name: 'Bank A', type: 'bank', opening_balance: 100000, aliases: ['atm biru', 'biru'] });
    expect(b.type).toBe('cash');
    expect(r.warnings).toContainEqual(expect.objectContaining({ type: 'rounded', legacyId: 'acc1', from: 100000.4, to: 100000 }));
  });

  it('kategori bawaan diperbarui, kategori buatan sendiri dibuat baru, anggaran ikut', () => {
    expect(r.payload.category_updates).toEqual([expect.objectContaining({ id: 'cat-makan', monthly_budget: 800000 })]);
    expect(r.payload.tables.categories).toEqual([expect.objectContaining({ name: 'Hobi', kind: 'expense', keywords: ['game', 'figure'] })]);
  });

  it('transaksi: jenis, jam 12.00 WIB, grup biaya admin', () => {
    expect(tx('t1')).toMatchObject({ kind: 'expense', amount: 20000, category_id: 'cat-makan', occurred_at: '2026-11-02T05:00:00.000Z', source: 'import' });
    expect(tx('t2')).toMatchObject({ kind: 'transfer', category_id: null });
    expect(tx('t2').group_id).toBeTruthy();
    expect(tx('t3').group_id).toBe(tx('t2').group_id);
  });

  it('tanggal mencurigakan ditandai, tidak diubah diam-diam', () => {
    expect(r.warnings).toContainEqual(expect.objectContaining({ type: 'suspicious_tx_date', legacyId: 't4', date: '2024-11-05' }));
    expect(tx('t4').occurred_at).toBe('2024-11-05T05:00:00.000Z');
  });

  it('pilihan pengguna di pratinjau dipakai', () => {
    const r2 = transformLegacyBackup(backup, ctx(), {
      transactionDates: { t4: '2026-11-05' }, semesterDates: { '3': { start: '2026-09-01', end: '2027-01-31' } }, billAccounts: { bill1: 'acc1' },
    });
    expect(r2.warnings.map((w) => w.type)).not.toContain('suspicious_tx_date');
    expect(r2.warnings.map((w) => w.type)).not.toContain('semester_without_dates');
    expect(r2.warnings.map((w) => w.type)).not.toContain('bill_without_account');
    expect(r2.payload.tables.semesters[0]).toMatchObject({ start_date: '2026-09-01', end_date: '2027-01-31', is_active: true });
  });

  it('transaksi dengan akun terhapus tidak hilang', () => {
    expect(r.payload.tables.accounts.find((a) => a.name === 'Akun lama (terhapus)')).toBeTruthy();
    expect(tx('t5').kind).toBe('income');
  });

  it('kuliah: hari 0 = Senin menjadi 1, jadwal rusak dilewati dengan peringatan', () => {
    expect(r.payload.tables.course_schedules).toHaveLength(1);
    expect(r.payload.tables.course_schedules[0]).toMatchObject({ weekday: 1, start_time: '07:00', location: 'B2' });
    expect(r.warnings).toContainEqual(expect.objectContaining({ type: 'skipped', legacyId: 's2' }));
    expect(r.warnings).toContainEqual({ type: 'semester_without_dates', semester: 3 });
  });

  it('tugas: jenis, prioritas, tenggat 23.59, slot kerja, subtugas', () => {
    const [t1, t2] = r.payload.tables.tasks;
    expect(t1).toMatchObject({ kind: 'practicum', priority: 'high', due_at: '2026-11-17T16:59:00.000Z', status: 'todo' });
    expect(t2).toMatchObject({ parent_id: t1.id, status: 'done', completed_at: '2026-11-10T05:00:00.000Z' });
    expect(r.payload.tables.task_work_slots[0]).toMatchObject({
      task_id: t1.id, start_at: '2026-11-15T03:15:00.000Z', end_at: '2026-11-15T05:15:00.000Z',
    });
  });

  it('riset: proyek default, status, tautan literatur ke ide', () => {
    const project = r.payload.tables.research_projects[0];
    expect(project.title).toBe('Riset utama');
    expect(r.payload.tables.research_ideas[0]).toMatchObject({ project_id: project.id, content: 'Ide A', status: 'raw' });
    expect(r.payload.tables.readings[0]).toMatchObject({
      verification_status: 'doi_checked', inclusion: 'use', linked_idea_ids: [r.payload.tables.research_ideas[0].id],
    });
  });

  it('acara, utang, tagihan, memori', () => {
    expect(r.payload.tables.events[0]).toMatchObject({
      start_at: '2026-11-21T01:00:00.000Z', end_at: '2026-11-22T09:30:00.000Z', is_all_day: false, location: 'Gunung', recurrence: 'none',
    });
    expect(r.payload.tables.debts[0]).toMatchObject({ direction: 'receivable', amount: 100000, paid_amount: 40000 });
    expect(r.payload.tables.bills[0]).toMatchObject({ frequency: 'monthly', due_day: 15, next_due_date: '2026-11-15', default_account_id: null });
    expect(r.warnings).toContainEqual({ type: 'bill_without_account', legacyId: 'bill1', name: 'Kos' });
    expect(r.payload.tables.agent_memory[0]).toMatchObject({ kind: 'preference', value: { text: 'rekening utama bank A' } });
  });

  it('saldo yang diharapkan mengikuti cara hitung app lama', () => {
    expect(r.expectedBalances).toEqual([
      { legacyId: 'acc1', name: 'Bank A', balance: 100000 - 20000 - 50000 - 2500 - 9999 },
      { legacyId: 'acc2', name: 'Dompet', balance: 50000 },
    ]);
  });

  it('baris dalam satu tabel punya kolom yang sama (syarat RPC)', () => {
    for (const rows of Object.values(r.payload.tables)) {
      const keys = JSON.stringify(Object.keys(rows[0]).sort());
      for (const row of rows) expect(JSON.stringify(Object.keys(row).sort())).toBe(keys);
    }
  });

  it('impor ulang tidak menggandakan baris yang sudah dipetakan', () => {
    const existingMap = new Map(r.payload.map.map((m) => [`${m.source_table}:${m.legacy_id}`, m.new_id]));
    const again = transformLegacyBackup(backup, { ...ctx(), existingMap });
    expect(Object.values(again.payload.tables).flat()).toHaveLength(0);
    expect(again.payload.category_updates).toHaveLength(0);
  });

  it('koleksi tak dikenal yang berisi data memblokir impor', () => {
    const bad = legacyBackup.parse({ ...fixture, data: { ...fixture.data, focus: [{ id: 'f1' }] } });
    expect(transformLegacyBackup(bad, ctx()).blockers[0]).toContain('focus');
  });
});
