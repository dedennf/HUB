import { describe, expect, it } from 'vitest';
import { review } from './srs';

const now = new Date('2026-11-24T00:00:00Z');
const fresh = { ease: 2.5, interval_days: 0, repetitions: 0, lapses: 0 };

describe('SM-2', () => {
  it('urutan interval 1, 6, lalu dikali ease', () => {
    const a = review(fresh, 4, now);
    expect(a).toMatchObject({ repetitions: 1, interval_days: 1, ease: 2.5, due_at: '2026-11-25T00:00:00.000Z' });
    const b = review(a, 4, now);
    expect(b).toMatchObject({ repetitions: 2, interval_days: 6 });
    const c = review(b, 5, now);
    expect(c).toMatchObject({ repetitions: 3, interval_days: 15 }); // round(6 * 2.5)
    expect(c.ease).toBeCloseTo(2.6);
  });
  it('lupa: ulang dari awal, lapses bertambah, ease turun tapi tidak di bawah 1,3', () => {
    const r = review({ ease: 1.35, interval_days: 20, repetitions: 5, lapses: 1 }, 1, now);
    expect(r).toMatchObject({ repetitions: 0, interval_days: 1, lapses: 2, ease: 1.3 });
  });
  it('sulit (3) menurunkan ease', () => {
    expect(review(fresh, 3, now).ease).toBeCloseTo(2.36);
  });
});
