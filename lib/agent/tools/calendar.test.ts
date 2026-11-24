import { describe, expect, it } from 'vitest';
import type { CalendarItem } from '../../calendar';
import { freeSlots } from './calendar';

const item = (time: string, endTime?: string): CalendarItem => ({ type: 'kelas', title: 'x', date: '2026-11-25', time, endTime, ref_table: 't', ref_id: 'i', color: '' });

describe('freeSlots', () => {
  const items = new Map([['2026-11-25', [item('08:00', '10:30'), item('13:00', '14:40'), item('19:00')]]]);
  it('celah di antara kelas, minimal durasi dihormati', () => {
    const s = freeSlots(items, '2026-11-25', '2026-11-25', 90, { date: '2026-11-24', time: '20:00' });
    expect(s).toEqual([
      { date: '2026-11-25', start: '10:30', end: '13:00', minutes: 150 },
      { date: '2026-11-25', start: '14:40', end: '19:00', minutes: 260 },
      { date: '2026-11-25', start: '20:00', end: '22:00', minutes: 120 },
    ]);
  });
  it('hari ini mulai dari sekarang (dibulatkan 15 menit), hari lalu dilewati', () => {
    const s = freeSlots(new Map(), '2026-11-23', '2026-11-24', 60, { date: '2026-11-24', time: '20:10' });
    expect(s).toEqual([{ date: '2026-11-24', start: '20:15', end: '22:00', minutes: 105 }]);
  });
});
