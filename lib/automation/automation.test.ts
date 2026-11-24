import { describe, expect, it } from 'vitest';
import { describeAction, describeCron, describeTrigger } from './describe';
import { deadlineStage, isUnusual, SYSTEM_AUTOMATIONS } from './system';
import { dailyCron, deliverAfter, inQuiet, nextCronRun, quietEndAfter, readQuiet, wibMinutes } from './time';

const wib = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);

describe('waktu WIB dan cron', () => {
  it('menit WIB dan cron harian dari setelan', () => {
    expect(wibMinutes(wib('2026-11-24', '06:30'))).toBe(390);
    expect(dailyCron('06:30', '07:00')).toBe('30 6 * * *');
    expect(dailyCron('rusak', '21:00')).toBe('0 21 * * *');
  });
  it('jadwal berikutnya di zona Asia/Jakarta', () => {
    expect(nextCronRun('30 6 * * *', wib('2026-11-24', '07:00'))?.toISOString()).toBe('2026-11-24T23:30:00.000Z');
    expect(nextCronRun('0 8 5 * *', wib('2026-11-24', '07:00'))?.toISOString()).toBe('2026-12-05T01:00:00.000Z');
    expect(nextCronRun('bukan cron', new Date())).toBeNull();
  });
});

describe('jam tenang (SPEC 8.1)', () => {
  const q = readQuiet(['22:30', '06:00']);
  it('melewati tengah malam', () => {
    expect(inQuiet(wib('2026-11-24', '23:00'), q)).toBe(true);
    expect(inQuiet(wib('2026-11-24', '05:59'), q)).toBe(true);
    expect(inQuiet(wib('2026-11-24', '06:00'), q)).toBe(false);
    expect(inQuiet(wib('2026-11-24', '12:00'), q)).toBe(false);
  });
  it('ditunda ke akhir jam tenang, kecuali peristiwanya jatuh di dalam jam tenang', () => {
    const now = wib('2026-11-24', '23:10');
    expect(quietEndAfter(now, q!).toISOString()).toBe(wib('2026-11-25', '06:00').toISOString());
    expect(deliverAfter(now, q)?.toISOString()).toBe(wib('2026-11-25', '06:00').toISOString());
    expect(deliverAfter(now, q, wib('2026-11-24', '23:59'))).toBeNull(); // tenggat 23.59 malam ini
    expect(deliverAfter(now, q, wib('2026-11-25', '09:00'))?.toISOString()).toBe(wib('2026-11-25', '06:00').toISOString());
    expect(deliverAfter(wib('2026-11-24', '12:00'), q)).toBeNull();
    expect(deliverAfter(now, null)).toBeNull();
  });
});

describe('aturan bawaan', () => {
  it('12 otomasi SPEC 8.5 dengan kunci unik', () => {
    expect(SYSTEM_AUTOMATIONS).toHaveLength(12);
    expect(new Set(SYSTEM_AUTOMATIONS.map((d) => d.key)).size).toBe(12);
    expect(SYSTEM_AUTOMATIONS.find((d) => d.key === 'briefing')!.trigger({ briefing_time: '05:45' })).toEqual({ type: 'schedule', cron: '45 5 * * *' });
  });
  it('tahap tenggat: H-3, H-1, 3 jam', () => {
    const now = 0, h = 3600_000;
    expect(deadlineStage(80 * h, now)).toBeNull();
    expect(deadlineStage(60 * h, now)).toBe('h3');
    expect(deadlineStage(20 * h, now)).toBe('h1');
    expect(deadlineStage(2 * h, now)).toBe('j3');
    expect(deadlineStage(-1, now)).toBeNull();
  });
  it('transaksi tidak biasa: ≥ 3x median, ≥ Rp50.000, minimal 5 pembanding', () => {
    expect(isUnusual(150_000, [20_000, 25_000, 30_000, 35_000, 40_000])).toBe(true);
    expect(isUnusual(60_000, [20_000, 25_000, 30_000, 35_000, 40_000])).toBe(false);
    expect(isUnusual(150_000, [20_000, 25_000])).toBe(false);
    expect(isUnusual(45_000, [5_000, 5_000, 5_000, 5_000, 5_000])).toBe(false);
  });
});

describe('bahasa manusia (SPEC 8.4)', () => {
  it('cron dan pemicu', () => {
    expect(describeCron('0 8 5 * *')).toBe('Tiap tanggal 5 jam 08.00');
    expect(describeCron('30 6 * * *')).toBe('Tiap hari jam 06.30');
    expect(describeCron('0 19 * * 0')).toBe('Tiap Minggu jam 19.00');
    expect(describeCron('*/5 * * * *')).toBe('Dicek tiap 5 menit');
    expect(describeTrigger({ type: 'event', event: 'transaction.created' })).toBe('Saat ada transaksi baru');
  });
  it('aksi', () => {
    expect(describeAction({ type: 'add_transaction', args: { kind: 'expense', amount: 150000, account: 'GoPay' } })).toBe('Catat pengeluaran Rp150.000 dari GoPay');
    expect(describeAction({ type: 'notify', title: 'Cek saldo' })).toBe('Kirim notifikasi "Cek saldo"');
  });
});
