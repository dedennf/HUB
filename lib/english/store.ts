// Penyimpanan modul Bahasa Inggris (SPEC 10). Dipakai halaman Bahasa, English Mode, dan tool correct_writing.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UndoOp } from '@/lib/agent/tools/types';
import type { EnglishProfile } from './ai';
import { review } from './srs';

export type FullProfile = EnglishProfile & { dailyMinutes: number; mode: boolean; targetBand: number; testDate: string | null };

export async function loadProfile(db: SupabaseClient): Promise<FullProfile> {
  const [{ data: s }, { data: m }] = await Promise.all([
    db.from('settings').select('key,value').in('key', ['english_level', 'english_goal', 'english_correction_level', 'english_daily_minutes', 'english_mode', 'english_target_band', 'english_test_date']),
    db.from('mistake_patterns').select('pattern').order('count', { ascending: false }).limit(3),
  ]);
  const v = Object.fromEntries((s ?? []).map((r) => [r.key, r.value]));
  return {
    level: typeof v.english_level === 'string' ? v.english_level : 'intermediate',
    goal: typeof v.english_goal === 'string' ? v.english_goal : 'academic_general',
    correction: typeof v.english_correction_level === 'string' ? v.english_correction_level : 'important_only',
    dailyMinutes: Number(v.english_daily_minutes) || 15,
    mode: v.english_mode === true,
    targetBand: Number(v.english_target_band) || 6.5,
    testDate: typeof v.english_test_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.english_test_date) ? v.english_test_date : null,
    topMistakes: (m ?? []).map((r) => r.pattern),
  };
}

export type Mistake = { original: string; fix: string; type: string; explanation_id: string };

/** Tambah hitungan mistake_patterns per jenis (SPEC 10.2.3). Mengembalikan operasi undo. */
export async function recordMistakes(db: SupabaseClient, mistakes: Mistake[], now: Date): Promise<UndoOp[]> {
  const ops: UndoOp[] = [];
  const types = [...new Set(mistakes.map((m) => m.type.trim().toLowerCase()).filter(Boolean))];
  for (const t of types) {
    const example = mistakes.find((m) => m.type.trim().toLowerCase() === t)?.original.slice(0, 300) ?? null;
    const { data: ex } = await db.from('mistake_patterns').select('id,count,example,last_seen_at').eq('pattern', t).maybeSingle();
    if (ex) {
      await db.from('mistake_patterns').update({ count: ex.count + 1, example, last_seen_at: now.toISOString() }).eq('id', ex.id);
      ops.push({ op: 'update', table: 'mistake_patterns', id: ex.id, values: { count: ex.count, example: ex.example, last_seen_at: ex.last_seen_at } });
    } else {
      const { data: ins } = await db.from('mistake_patterns').insert({ pattern: t, example, last_seen_at: now.toISOString() }).select('id').single();
      if (ins) ops.push({ op: 'delete', table: 'mistake_patterns', id: ins.id });
    }
  }
  return ops;
}

/** Simpan tulisan dan koreksinya, lalu perbarui pola kesalahan. */
export async function saveSubmission(db: SupabaseClient, s: {
  kind: 'free' | 'summary' | 'abstract' | 'journal' | 'english_mode' | 'ielts_task1' | 'ielts_task2'; original: string; corrected: string; prompt?: string | null;
  mistakes: Mistake[]; score?: Record<string, number> | null; summary?: string; extra?: Record<string, unknown>;
}, now: Date): Promise<{ id: string; undo: UndoOp[] }> {
  const { data, error } = await db.from('writing_submissions').insert({
    kind: s.kind, original: s.original, corrected: s.corrected, prompt: s.prompt ?? null,
    feedback: { mistakes: s.mistakes, score: s.score ?? null, summary: s.summary ?? null, ...(s.extra ?? {}) },
  }).select('id').single();
  if (error || !data) throw new Error(`Gagal menyimpan tulisan: ${error?.message}`);
  const undo: UndoOp[] = [{ op: 'delete', table: 'writing_submissions', id: data.id }, ...(await recordMistakes(db, s.mistakes, now))];
  return { id: data.id, undo };
}

/** Nilai satu kartu (SM-2) dan catat ulasannya. Pengguna sendiri yang menilai, jadi langsung tersimpan. */
export async function gradeVocab(db: SupabaseClient, id: string, grade: number, now: Date) {
  const { data: v } = await db.from('vocab').select('ease,interval_days,repetitions,lapses').eq('id', id).maybeSingle();
  if (!v) throw new Error('Kosakata tidak ditemukan.');
  const next = review({ ease: Number(v.ease), interval_days: v.interval_days, repetitions: v.repetitions, lapses: v.lapses }, grade, now);
  const { error } = await db.from('vocab').update(next).eq('id', id);
  if (error) throw new Error(error.message);
  await db.from('vocab_reviews').insert({ vocab_id: id, grade });
  return next;
}

export async function logSession(db: SupabaseClient, s: { kind: 'review' | 'reading' | 'writing' | 'speaking' | 'grammar' | 'listening'; seconds?: number; summary?: string; score?: Record<string, unknown> | null }) {
  await db.from('practice_sessions').insert({ kind: s.kind, duration_seconds: s.seconds ? Math.round(s.seconds) : null, summary: s.summary?.slice(0, 500) ?? null, score: s.score ?? null });
}

/** Streak: hari berturut-turut dengan aktivitas bahasa (review, latihan, atau tulisan). */
export function streakDays(dates: Set<string>, today: string, addDays: (d: string, n: number) => string): number {
  let n = 0;
  for (let d = dates.has(today) ? today : addDays(today, -1); dates.has(d); d = addDays(d, -1)) n++;
  return n;
}
