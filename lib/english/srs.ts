// Spaced repetition SM-2 (SPEC 10.2). Fungsi murni.
export type SrsState = { ease: number; interval_days: number; repetitions: number; lapses: number };

/** grade 0..5. Lupa (1), Sulit (3), Bisa (4), Mudah (5). */
export function review(s: SrsState, grade: number, now: Date): SrsState & { due_at: string } {
  const g = Math.max(0, Math.min(5, Math.round(grade)));
  let { repetitions, interval_days, lapses } = s;
  if (g < 3) {
    repetitions = 0;
    interval_days = 1;
    lapses += 1;
  } else {
    repetitions += 1;
    interval_days = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(interval_days * s.ease);
  }
  const ease = Math.max(1.3, Number((s.ease + 0.1 - (5 - g) * (0.08 + (5 - g) * 0.02)).toFixed(4)));
  return { ease, interval_days, repetitions, lapses, due_at: new Date(now.getTime() + interval_days * 864e5).toISOString() };
}
