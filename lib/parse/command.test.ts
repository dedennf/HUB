import { describe, expect, it } from 'vitest';
import { parseCommand, type ParseContext } from './command';
import { findAmount, parseDate, pullTime } from './core';

// Data karangan. "Hari ini" = Selasa 24 Nov 2026.
const TODAY = '2026-11-24';
const ctx: ParseContext = {
  accounts: [
    { id: 'bca', name: 'BCA', aliases: ['atm biru'], type: 'bank' },
    { id: 'gopay', name: 'GoPay', aliases: [], type: 'ewallet' },
    { id: 'dana', name: 'Dana', aliases: [], type: 'ewallet' },
    { id: 'tunai', name: 'Tunai', aliases: ['cash'], type: 'cash' },
  ],
  categories: [
    { id: 'c-makan', kind: 'expense', name: 'Makan & minum', keywords: ['makan', 'kopi', 'jajan'], slug: 'o_makan', is_hidden: false },
    { id: 'c-transport', kind: 'expense', name: 'Transportasi', keywords: ['bensin', 'ojol', 'parkir'], slug: 'o_transport', is_hidden: false },
    { id: 'c-lain', kind: 'expense', name: 'Lainnya', keywords: [], slug: 'o_lain', is_hidden: false },
    { id: 'c-gaji', kind: 'income', name: 'Gaji, honor, atau upah magang', keywords: ['gaji', 'honor'], slug: 'i_gaji', is_hidden: false },
    { id: 'c-ilain', kind: 'income', name: 'Lainnya', keywords: [], slug: 'i_lain', is_hidden: false },
  ],
  courses: [{ id: 'rdtr', name: 'Penyusunan Rencana Daerah Tata Ruang', alias: 'RDTR' }],
  lastAccountId: 'bca',
};
const parse = (t: string) => parseCommand(t, ctx, TODAY);
const items = (t: string) => { const r = parse(t); if (r.kind !== 'proposals') throw new Error(`bukan usulan: ${JSON.stringify(r)}`); return r.items; };

describe('core', () => {
  it('tanggal relatif dihitung dari hari ini WIB', () => {
    expect(parseDate('besok', 'future', TODAY).date).toBe('2026-11-25');
    expect(parseDate('jumat', 'future', TODAY).date).toBe('2026-11-27');
    expect(parseDate('jumat', 'past', TODAY).date).toBe('2026-11-20');
    expect(parseDate('senin depan', 'future', TODAY).date).toBe('2026-11-30');
    expect(parseDate('3 des', 'future', TODAY).date).toBe('2026-12-03');
    expect(parseDate('3 jan', 'future', TODAY).date).toBe('2027-01-03');
    expect(parseDate('tanggal 5', 'future', TODAY).date).toBe('2026-12-05');
    expect(parseDate('31/2', 'future', TODAY).date).toBeNull();
  });
  it('nominal gaya Indonesia', () => {
    expect(findAmount('bensin 30rb').amount).toBe(30000);
    expect(findAmount('makan 25 ribu').amount).toBe(25000);
    expect(findAmount('gaji 1,5jt').amount).toBe(1500000);
    expect(findAmount('beli 1.250.000').amount).toBe(1250000);
    expect(findAmount('kopi goceng').amount).toBe(5000);
    expect(findAmount('lantai 3').amount).toBe(0);
  });
  it('jam', () => {
    expect(pullTime('jam 14 di perpus').start).toBe('14:00');
    expect(pullTime('13.50-15.00')).toMatchObject({ start: '13:50', end: '15:00' });
    expect(pullTime('jam 12 malem').start).toBe('23:59');
    expect(pullTime('jam 7 malam').start).toBe('19:00');
  });
});

describe('uji kalimat SPEC Fase 3', () => {
  it('"tadi beli bensin 30rb pakai gopay terus makan siang 25 ribu cash" = dua pengeluaran', () => {
    const [a, b] = items('tadi beli bensin 30rb pakai gopay terus makan siang 25 ribu cash');
    expect(a).toMatchObject({ type: 'transaction', kind: 'expense', amount: 30000, account_id: 'gopay', category_id: 'c-transport', date: TODAY, guessedAccount: false });
    expect(b).toMatchObject({ type: 'transaction', kind: 'expense', amount: 25000, account_id: 'tunai', category_id: 'c-makan' });
  });
  it('"tugas laporan RDTR dikumpul jumat jam 23.59"', () => {
    const [t] = items('tugas laporan RDTR dikumpul jumat jam 23.59');
    expect(t).toMatchObject({ type: 'task', title: 'Laporan', course_id: 'rdtr', due_date: '2026-11-27', due_time: '23:59', kind: 'assignment' });
  });
  it('"pindahin 500rb dari BCA ke Dana" = transfer, bukan pengeluaran', () => {
    const [t] = items('pindahin 500rb dari BCA ke Dana');
    expect(t).toMatchObject({ kind: 'transfer', amount: 500000, account_id: 'bca', to_account_id: 'dana', category_id: null });
  });
  it('"sisa uang di semua akun berapa" = pertanyaan saldo', () => {
    expect(parse('sisa uang di semua akun berapa')).toEqual({ kind: 'question', question: { topic: 'balance', accountIds: [] } });
  });
});

describe('perintah lain', () => {
  it('pemasukan dan kategori', () => {
    expect(items('gaji 1,5jt bca')[0]).toMatchObject({ kind: 'income', amount: 1500000, account_id: 'bca', category_id: 'c-gaji' });
  });
  it('akun tidak disebut: akun terakhir, ditandai ditebak', () => {
    expect(items('kopi 18rb')[0]).toMatchObject({ account_id: 'bca', category_id: 'c-makan', guessedAccount: true });
    expect(items('beli kabel 40rb dana')[0]).toMatchObject({ account_id: 'dana', category_id: 'c-lain', guessedCategory: true });
  });
  it('tarik tunai dengan biaya admin', () => {
    expect(items('tarik tunai 200rb atm biru admin 2500')[0]).toMatchObject({ kind: 'transfer', amount: 200000, account_id: 'bca', to_account_id: 'tunai', fee: 2500 });
  });
  it('tenggat "jam 12 malem" dibaca 23.59 dan ditandai', () => {
    expect(items('tugas laporan jumat jam 12 malem')[0]).toMatchObject({ due_date: '2026-11-27', due_time: '23:59', guessedTime: true });
  });
  it('acara, acara berulang, ide, kebutuhan', () => {
    expect(items('rapat kelompok besok jam 14 di perpus')[0]).toMatchObject({ type: 'event', title: 'Rapat kelompok', date: '2026-11-25', start_time: '14:00', location: 'Perpus' });
    expect(items('acara les tiap senin jam 19')[0]).toMatchObject({ type: 'event', title: 'Les', recurrence: 'weekly', date: '2026-11-30', start_time: '19:00' });
    expect(items('ide: LiDAR sebelum dan sesudah hujan')[0]).toEqual({ type: 'idea', content: 'LiDAR sebelum dan sesudah hujan' });
    expect(items('butuh izin akses data BIG')[0]).toMatchObject({ type: 'need', kind: 'izin' });
  });
  it('pertanyaan pengeluaran per periode dan kategori', () => {
    const r = parse('berapa pengeluaran makan bulan ini');
    expect(r).toMatchObject({ kind: 'question', question: { topic: 'spending', categoryId: 'c-makan', period: { from: '2026-11-01', to: '2026-11-30' } } });
  });
  it('tidak dikenal', () => {
    expect(parse('halo')).toEqual({ kind: 'unknown' });
  });
});
