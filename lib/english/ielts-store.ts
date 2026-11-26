// Penyimpanan sesi harian IELTS dan ringkasan band (D-60).
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, zonedToIso } from '@/lib/time';
import type { DailyWord, GrammarLesson } from './ielts-ai';
import {
  bandOf, overallBand, pickGrammarTopic, recentBand, skillFor, writingBand,
  type SessionStep, type Skill, type SpeakingBands, type WritingBands,
} from './ielts';

export type Day = {
  id: string; day: string; words: DailyWord[]; grammar_key: string | null; grammar: GrammarLesson | null;
  grammar_score: number | null; skill: Skill; done: Partial<Record<SessionStep, boolean>>;
};

const COLS = 'id,day,words,grammar_key,grammar,grammar_score,skill,done';

/** Baris sesi untuk tanggal itu. Dibuat bila belum ada, dengan topik grammar dan skill hari itu. */
export async function ensureDay(db: SupabaseClient, date: string, profile: { level: string; topMistakes: string[] }): Promise<Day> {
  const { data: found } = await db.from('english_days').select(COLS).eq('day', date).maybeSingle();
  if (found) return found as Day;
  const { data: progress } = await db.from('grammar_progress').select('topic_key,best_score,last_at');
  const topic = pickGrammarTopic(progress ?? [], profile.topMistakes, profile.level);
  const { data, error } = await db.from('english_days')
    .upsert({ day: date, skill: skillFor(date), grammar_key: topic.key }, { onConflict: 'user_id,day', ignoreDuplicates: true })
    .select(COLS).maybeSingle();
  if (data) return data as Day;
  // baris dibuat permintaan lain di saat yang sama
  const { data: again } = await db.from('english_days').select(COLS).eq('day', date).maybeSingle();
  if (!again) throw new Error(`Gagal menyiapkan sesi hari ini: ${error?.message ?? 'tidak diketahui'}`);
  return again as Day;
}

export async function markStep(db: SupabaseClient, date: string, step: SessionStep): Promise<void> {
  const { data } = await db.from('english_days').select('id,done').eq('day', date).maybeSingle();
  if (!data) return;
  const done = { ...(data.done as Record<string, boolean>), [step]: true };
  await db.from('english_days').update({ done }).eq('id', data.id);
}

/** Tandai langkah skill selesai bila latihan yang baru disimpan sama dengan skill hari itu. */
export async function markSkillIfToday(db: SupabaseClient, date: string, skill: Skill): Promise<void> {
  const { data } = await db.from('english_days').select('skill').eq('day', date).maybeSingle();
  if (data?.skill === skill) await markStep(db, date, 'skill');
}

export async function saveGrammarScore(db: SupabaseClient, date: string, key: string, score: number, now: Date): Promise<void> {
  await db.from('english_days').update({ grammar_score: score }).eq('day', date);
  const { data: p } = await db.from('grammar_progress').select('id,attempts,best_score').eq('topic_key', key).maybeSingle();
  if (p) {
    await db.from('grammar_progress').update({ attempts: p.attempts + 1, best_score: Math.max(p.best_score, score), last_score: score, last_at: now.toISOString() }).eq('id', p.id);
  } else {
    await db.from('grammar_progress').insert({ topic_key: key, attempts: 1, best_score: score, last_score: score, last_at: now.toISOString() });
  }
  await markStep(db, date, 'grammar');
}

export type BandSummary = { reading: number | null; writing: number | null; speaking: number | null; listening: number | null; overall: number | null; samples: { reading: number; writing: number; speaking: number; listening: number } };

/** Perkiraan band per skill dari latihan 60 hari terakhir (3 nilai terakhir per skill). */
export async function bandSummary(db: SupabaseClient, today: string): Promise<BandSummary> {
  const since = zonedToIso(addDays(today, -60));
  const [{ data: writings }, { data: sessions }] = await Promise.all([
    db.from('writing_submissions').select('kind,feedback,created_at').in('kind', ['ielts_task1', 'ielts_task2']).gte('created_at', since).order('created_at', { ascending: false }).limit(20),
    db.from('practice_sessions').select('kind,score,created_at').in('kind', ['reading', 'speaking', 'listening']).gte('created_at', since).order('created_at', { ascending: false }).limit(40),
  ]);
  const wb = (kind: string) => (writings ?? []).filter((w) => w.kind === kind)
    .map((w) => (w.feedback as { bands?: WritingBands } | null)?.bands).filter((b): b is WritingBands => !!b).map(bandOf);
  const t1 = wb('ielts_task1'), t2 = wb('ielts_task2');
  const sb = (sessions ?? []).filter((s) => s.kind === 'speaking').map((s) => (s.score as { bands?: SpeakingBands } | null)?.bands).filter((b): b is SpeakingBands => !!b).map(bandOf);
  const rb = (sessions ?? []).filter((s) => s.kind === 'reading').map((s) => Number((s.score as { band?: number } | null)?.band)).filter(Number.isFinite);
  const lb = (sessions ?? []).filter((s) => s.kind === 'listening').map((s) => Number((s.score as { band?: number } | null)?.band)).filter(Number.isFinite);
  const reading = recentBand(rb), speaking = recentBand(sb), listening = recentBand(lb);
  const writing = writingBand(recentBand(t1), recentBand(t2));
  return {
    reading, writing, speaking, listening,
    overall: overallBand([reading, listening, writing, speaking]),
    samples: { reading: rb.length, writing: t1.length + t2.length, speaking: sb.length, listening: lb.length },
  };
}
