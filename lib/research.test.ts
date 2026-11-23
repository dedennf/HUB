import { describe, expect, it } from 'vitest';
import { daysUntouched, summarizeProject } from './research';

describe('research', () => {
  it('ringkasan proyek aktif', () => {
    const r = summarizeProject(
      [{ id: 'p', title: 'Skripsi', status: 'active' }],
      [{ id: 'a', project_id: 'p', title: 'A', due_date: null, progress: 60 }, { id: 'b', project_id: 'p', title: 'B', due_date: null, progress: 100 }, { id: 'c', project_id: 'x', title: 'C', due_date: null, progress: 0 }],
      [{ id: 's', met_on: null, supervisor: null, points: null, status: 'open', next_on: '2026-11-30' }],
      '2026-11-23',
    );
    expect(r).toMatchObject({ percent: 80, done: 1, total: 2, nextSupervision: '2026-11-30' });
    expect(summarizeProject([], [], [], '2026-11-23')).toBeNull();
  });
  it('hari tidak disentuh', () => {
    expect(daysUntouched('2026-11-18T03:00:00Z', '2026-11-23')).toBe(5);
    expect(daysUntouched(null, '2026-11-23')).toBeNull();
  });
});
