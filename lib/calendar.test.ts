import { describe, expect, it } from 'vitest';
import { buildCalendarItems, type CalendarSources } from './calendar';

const base: CalendarSources = {
  semesters: [{ id: 'sem', name: 'Semester 7', number: 7, start_date: '2026-09-01', end_date: '2026-12-31', is_active: true }],
  courses: [{ id: 'c1', semester_id: 'sem', name: 'Statistika', alias: null, lecturer: null, credits: 2 }],
  schedules: [{ id: 's1', course_id: 'c1', weekday: 1, start_time: '07:00:00', end_time: '08:40:00', location: 'B2' }],
  tasks: [{ id: 't1', course_id: 'c1', parent_id: null, title: 'Laporan', kind: 'exam', priority: 'medium', due_at: '2026-11-17T16:59:00Z', status: 'todo', description: null }],
  slots: [{ id: 'w1', task_id: 't1', start_at: '2026-11-15T03:15:00Z', end_at: '2026-11-15T05:15:00Z' }],
  holidays: [{ id: 'h1', name: 'Libur', start_date: '2026-11-23', end_date: null }],
  events: [
    { id: 'e1', title: 'Kemah', start_at: '2026-11-21T01:00:00Z', end_at: '2026-11-22T09:30:00Z', is_all_day: false, location: 'Gunung', recurrence: 'none', recurrence_until: null },
    { id: 'e2', title: 'Les', start_at: '2026-11-02T12:00:00Z', end_at: null, is_all_day: false, location: null, recurrence: 'weekly', recurrence_until: '2026-11-20' },
  ],
  targets: [], supervisions: [],
  bills: [{ id: 'b1', name: 'Listrik', amount: 1, frequency: 'monthly', next_due_date: '2026-11-20', default_account_id: null, category_id: null, is_active: true, note: null }],
  sinking: [],
};

describe('buildCalendarItems', () => {
  const items = buildCalendarItems(base, '2026-11-14', '2026-11-30');
  const types = (d: string) => (items.get(d) ?? []).map((i) => i.type);

  it('kelas muncul tiap Senin kecuali saat libur', () => {
    expect(types('2026-11-16')).toContain('kelas');
    expect(types('2026-11-23')).toEqual(['libur']);
    expect(types('2026-11-30')).toContain('kelas');
  });
  it('tenggat ujian, slot kerja, dan tagihan memakai tanggal WIB', () => {
    expect(types('2026-11-17')).toContain('ujian');
    expect(items.get('2026-11-15')?.[0]).toMatchObject({ type: 'kerjakan', time: '10:15', endTime: '12:15' });
    expect(types('2026-11-20')).toContain('tagihan');
  });
  it('acara beberapa hari dan acara mingguan dengan batas', () => {
    expect(types('2026-11-21')).toContain('acara');
    expect(types('2026-11-22')).toContain('acara');
    const d1 = items.get('2026-11-21')?.find((i) => i.type === 'acara');
    const d2 = items.get('2026-11-22')?.find((i) => i.type === 'acara');
    expect(d1).toMatchObject({ time: '08:00', endTime: undefined, subtitle: 'Gunung · hari 1 dari 2' });
    expect(d2).toMatchObject({ time: undefined, subtitle: 'Gunung · hari 2 dari 2 · sampai 16:30' });
    expect(types('2026-11-16')).toContain('acara'); // Senin, Les mingguan
    expect(types('2026-11-30')).not.toContain('acara'); // lewat recurrence_until
  });
});
