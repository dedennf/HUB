import { describe, expect, it } from 'vitest';
import { daysUntouched, linkedReadingCounts, summarizeProject } from './research';

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

describe('linkedReadingCounts', () => {
  it('menghitung literatur per target dan ide, tautan ganda dihitung sekali', () => {
    const c = linkedReadingCounts([
      { linked_target_ids: ['t1', 't1', 't2'], linked_idea_ids: ['i1'] },
      { linked_target_ids: ['t1'] },
      {},
    ]);
    expect(c.targets.get('t1')).toBe(2);
    expect(c.targets.get('t2')).toBe(1);
    expect(c.ideas.get('i1')).toBe(1);
  });
});
