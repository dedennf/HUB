'use server';
// Server action modul Bahasa v2 untuk IELTS (D-60). Semua aksi dipicu tombol pengguna sendiri,
// jadi langsung tersimpan tanpa kartu konfirmasi Ra (sama seperti review kartu, D-54).
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { topicByKey, readingBand, bandOf, type Skill } from '@/lib/english/ielts';
import {
  assessWriting, checkSentence, dailyWords, grammarLesson, listeningScript, readingSet, speakingPrompt, writingPrompt,
  type DailyWord, type GrammarLesson, type ReadingSet, type SentenceCheck, type SpeakingPrompt, type WritingAssessment, type WritingPrompt,
} from '@/lib/english/ielts-ai';
import { ensureDay, markSkillIfToday, markStep, saveGrammarScore } from '@/lib/english/ielts-store';
import { gapCorrect, listeningBand } from '@/lib/english/listening';
import { withModel, type Result } from '@/lib/english/run';
import { loadProfile, logSession, saveSubmission } from '@/lib/english/store';
import { createClient } from '@/lib/supabase/server';
import { todayIso } from '@/lib/time';

const WORDS_PER_DAY = 5;

async function ctx() {
  await requireUser();
  const db = await createClient();
  const profile = await loadProfile(db);
  const now = new Date();
  const today = todayIso(now);
  return { db, profile, now, today };
}

/* ---------------- langkah sesi ---------------- */

export async function markReviewDone(): Promise<void> {
  const { db, today } = await ctx();
  await markStep(db, today, 'review');
  revalidatePath('/bahasa');
}

export async function prepareWords(): Promise<Result<{ words: DailyWord[]; learned: boolean }>> {
  const { db, profile, today } = await ctx();
  const day = await ensureDay(db, today, profile);
  if (day.words.length) return { ok: true, data: { words: day.words, learned: !!day.done.words } };
  const { data: known } = await db.from('vocab').select('term').order('created_at', { ascending: false }).limit(300);
  const r = await withModel((m) => dailyWords(m, profile, { exclude: (known ?? []).map((v) => v.term), count: WORDS_PER_DAY }, AbortSignal.timeout(30_000)));
  if (!r.ok) return r;
  const words = r.data.words.slice(0, WORDS_PER_DAY);
  await db.from('english_days').update({ words }).eq('id', day.id);
  return { ok: true, data: { words, learned: false } };
}

export async function checkWordSentence(term: string, sentence: string): Promise<Result<SentenceCheck>> {
  const { profile } = await ctx();
  const s = sentence.trim();
  if (s.split(/\s+/).length < 4) return { ok: false, message: 'Tulis satu kalimat utuh, minimal 4 kata.' };
  return withModel((m) => checkSentence(m, profile, { term: term.slice(0, 80), sentence: s.slice(0, 400) }, AbortSignal.timeout(25_000)));
}

/** Masukkan 5 kata hari ini ke bank kata (jadwal review SM-2 mulai besok). */
export async function learnWords(): Promise<Result<{ added: number }>> {
  const { db, profile, today } = await ctx();
  const day = await ensureDay(db, today, profile);
  let added = 0;
  for (const w of day.words) {
    const { data: dup } = await db.from('vocab').select('id').ilike('term', w.term).limit(1);
    if (dup?.length) continue;
    const { error } = await db.from('vocab').insert({
      term: w.term, meaning_id: w.meaning_id, definition_en: [w.definition_en, w.collocations.length ? `Collocations: ${w.collocations.join(', ')}` : ''].filter(Boolean).join(' · ') || null,
      example: w.example || null, part_of_speech: w.part_of_speech || null, source_type: 'daily',
      // baru dipelajari hari ini, review pertama besok
      due_at: new Date(Date.now() + 864e5).toISOString(),
    });
    if (!error) added++;
  }
  await markStep(db, today, 'words');
  revalidatePath('/bahasa');
  return { ok: true, data: { added } };
}

export async function prepareGrammar(): Promise<Result<{ key: string; title: string; level: string; use: string; lesson: GrammarLesson; score: number | null }>> {
  const { db, profile, today } = await ctx();
  const day = await ensureDay(db, today, profile);
  const topic = topicByKey(day.grammar_key);
  if (!topic) return { ok: false, message: 'Topik grammar hari ini tidak dikenal.' };
  let lesson = day.grammar;
  if (!lesson) {
    const r = await withModel((m) => grammarLesson(m, profile, topic, AbortSignal.timeout(40_000)));
    if (!r.ok) return r;
    lesson = r.data;
    await db.from('english_days').update({ grammar: lesson }).eq('id', day.id);
  }
  return { ok: true, data: { key: topic.key, title: topic.title, level: topic.level, use: topic.use, lesson, score: day.grammar_score } };
}

export async function submitGrammar(score: number, total: number): Promise<Result<null>> {
  const { db, profile, today, now } = await ctx();
  if (!Number.isInteger(score) || !Number.isInteger(total) || total < 1 || score < 0 || score > total) return { ok: false, message: 'Skor tidak valid.' };
  const day = await ensureDay(db, today, profile);
  if (!day.grammar_key) return { ok: false, message: 'Belum ada topik grammar.' };
  // simpan dalam skala 5 supaya ambang "dikuasai" (>= 4) tetap sama walau jumlah soal berubah
  const scaled = Math.round((score / total) * 5);
  await saveGrammarScore(db, today, day.grammar_key, scaled, now);
  await logSession(db, { kind: 'grammar', summary: `${topicByKey(day.grammar_key)?.title ?? day.grammar_key}: ${score}/${total}`, score: { correct: score, total } });
  revalidatePath('/bahasa');
  return { ok: true, data: null };
}

/* ---------------- Writing ---------------- */

export async function newWritingPrompt(task: 1 | 2): Promise<Result<WritingPrompt>> {
  const { profile } = await ctx();
  if (task !== 1 && task !== 2) return { ok: false, message: 'Task tidak valid.' };
  return withModel((m) => writingPrompt(m, profile, task, AbortSignal.timeout(30_000)));
}

const tableSchema = z.object({ title: z.string(), unit: z.string(), columns: z.array(z.string()).max(6), rows: z.array(z.object({ label: z.string(), values: z.array(z.number()) })).max(8) });
const writingInput = z.object({
  task: z.union([z.literal(1), z.literal(2)]),
  question: z.string().trim().min(10).max(2000),
  table: tableSchema.nullable().optional(),
  text: z.string().trim().min(40, 'Tulis minimal beberapa kalimat dulu.').max(8000, 'Tulisan terlalu panjang (maks 8.000 huruf).'),
  revisionOf: z.uuid().nullable().optional(),
  seconds: z.number().min(0).max(36_000).optional(),
});

export type WritingResult = WritingAssessment & { id: string; band: number; words: number };

export async function submitWriting(input: z.input<typeof writingInput>): Promise<Result<WritingResult>> {
  const { db, profile, now, today } = await ctx();
  const p = writingInput.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0].message };
  const { task, question, table, text, revisionOf, seconds } = p.data;
  const words = text.split(/\s+/).filter(Boolean).length;
  let previous: string | undefined;
  if (revisionOf) {
    const { data } = await db.from('writing_submissions').select('original').eq('id', revisionOf).maybeSingle();
    previous = data?.original ?? undefined;
  }
  const tableText = table ? `\nTabel: ${table.title} (${table.unit})\n${table.columns.join(' | ')}\n${table.rows.map((r) => `${r.label} | ${r.values.join(' | ')}`).join('\n')}` : '';
  const r = await withModel((m) => assessWriting(m, profile, { task, question: question + tableText, text, words, previous }, AbortSignal.timeout(50_000)));
  if (!r.ok) return r;
  const band = bandOf(r.data.bands);
  const saved = await saveSubmission(db, {
    kind: task === 1 ? 'ielts_task1' : 'ielts_task2', original: text, corrected: r.data.improved, prompt: question,
    mistakes: r.data.mistakes, score: { ...r.data.bands, band }, summary: r.data.summary_id,
    extra: { bands: r.data.bands, notes: r.data.notes, band, words, table: table ?? null, revision_of: revisionOf ?? null },
  }, now);
  await logSession(db, { kind: 'writing', seconds, summary: `IELTS Task ${task}: band ${band} (${words} kata)`, score: { band, ...r.data.bands } });
  await markSkillIfToday(db, today, task === 1 ? 'writing_task1' : 'writing_task2');
  revalidatePath('/bahasa');
  return { ok: true, data: { ...r.data, id: saved.id, band, words } };
}

/* ---------------- Speaking dan Reading ---------------- */

export async function newSpeakingPrompt(part: 1 | 2 | 3): Promise<Result<SpeakingPrompt>> {
  const { profile } = await ctx();
  if (![1, 2, 3].includes(part)) return { ok: false, message: 'Part tidak valid.' };
  return withModel((m) => speakingPrompt(m, profile, part, AbortSignal.timeout(30_000)));
}

export async function newReadingSet(): Promise<Result<ReadingSet>> {
  const { profile } = await ctx();
  return withModel((m) => readingSet(m, profile, AbortSignal.timeout(50_000)));
}

export async function submitReading(input: { title: string; correct: number; total: number; seconds: number }): Promise<Result<{ band: number | null }>> {
  const { db, today } = await ctx();
  const { correct, total } = input;
  if (!Number.isInteger(correct) || !Number.isInteger(total) || total < 1 || correct < 0 || correct > total) return { ok: false, message: 'Skor tidak valid.' };
  const band = readingBand(correct, total);
  await logSession(db, { kind: 'reading', seconds: Math.min(input.seconds, 7200), summary: `IELTS Reading "${input.title.slice(0, 80)}": ${correct}/${total}`, score: { band, correct, total } });
  await markSkillIfToday(db, today, 'reading');
  revalidatePath('/bahasa');
  return { ok: true, data: { band } };
}

export async function completeSkill(skill: Skill): Promise<void> {
  const { db, today } = await ctx();
  await markSkillIfToday(db, today, skill);
  revalidatePath('/bahasa');
}

/* ---------------- Listening (D-65) ---------------- */

export type ListeningQuestionView = { type: 'gap' | 'mcq'; prompt: string; options: string[] };
export type ListeningView = { id: string; section: 1 | 4; title: string; questions: ListeningQuestionView[]; audioUrl: string | null; duration: number | null };

const listenId = z.uuid();

/** Langkah 1: Gemini menulis naskah dan soal. Kunci jawaban disimpan di server, tidak dikirim ke browser. */
export async function createListening(section: 1 | 4): Promise<Result<{ id: string }>> {
  const { db, profile } = await ctx();
  if (section !== 1 && section !== 4) return { ok: false, message: 'Section tidak valid.' };
  const r = await withModel((m) => listeningScript(m, profile, section, AbortSignal.timeout(50_000)));
  if (!r.ok) return r;
  const { title, speakers, lines, questions } = r.data;
  const { data, error } = await db.from('listening_sets').insert({ section, title, script: { speakers, lines }, questions }).select('id').single();
  if (error || !data) return { ok: false, message: 'Gagal menyimpan latihan Listening.' };
  return { ok: true, data: { id: data.id } };
}

/** Soal tanpa kunci jawaban, plus tautan audio sementara bila audionya sudah dibuat. */
export async function getListening(id: string): Promise<Result<ListeningView>> {
  const { db } = await ctx();
  if (!listenId.safeParse(id).success) return { ok: false, message: 'Latihan tidak valid.' };
  const { data } = await db.from('listening_sets').select('id,section,title,questions,audio_path,duration_seconds').eq('id', id).maybeSingle();
  if (!data) return { ok: false, message: 'Latihan tidak ditemukan.' };
  let audioUrl: string | null = null;
  if (data.audio_path) {
    const { data: signed } = await db.storage.from('listening').createSignedUrl(data.audio_path, 60 * 60);
    audioUrl = signed?.signedUrl ?? null;
  }
  const questions = (data.questions as { type: 'gap' | 'mcq'; prompt: string; options?: string[] }[]).map((q) => ({ type: q.type, prompt: q.prompt, options: q.options ?? [] }));
  return { ok: true, data: { id: data.id, section: data.section, title: data.title, questions, audioUrl, duration: data.duration_seconds } };
}

export type ListeningResult = {
  correct: number; total: number; band: number | null;
  items: { prompt: string; given: string; answer: string; ok: boolean; explanation_id: string }[];
  lines: { speaker: string; text: string; translation_id: string }[];
};

/** Nilai jawaban di server, lalu kirim transkrip lengkap dengan terjemahan bahasa Indonesia. */
export async function submitListening(id: string, answers: string[], seconds: number): Promise<Result<ListeningResult>> {
  const { db, today } = await ctx();
  if (!listenId.safeParse(id).success || !Array.isArray(answers)) return { ok: false, message: 'Jawaban tidak valid.' };
  const { data } = await db.from('listening_sets').select('title,script,questions,best_score,attempts').eq('id', id).maybeSingle();
  if (!data) return { ok: false, message: 'Latihan tidak ditemukan.' };
  const qs = data.questions as { type: 'gap' | 'mcq'; prompt: string; answer: string; accept?: string[]; explanation_id: string }[];
  const items = qs.map((q, i) => {
    const given = String(answers[i] ?? '').slice(0, 100);
    const ok = q.type === 'gap' ? gapCorrect(given, q.answer, q.accept ?? []) : given === q.answer;
    return { prompt: q.prompt, given, answer: q.answer, ok, explanation_id: q.explanation_id };
  });
  const correct = items.filter((x) => x.ok).length;
  const band = listeningBand(correct, qs.length);
  await db.from('listening_sets').update({ attempts: data.attempts + 1, best_score: Math.max(data.best_score ?? 0, correct) }).eq('id', id);
  await logSession(db, { kind: 'listening', seconds: Math.min(seconds, 7200), summary: `IELTS Listening "${data.title.slice(0, 80)}": ${correct}/${qs.length}`, score: { band, correct, total: qs.length } });
  await markSkillIfToday(db, today, 'listening');
  revalidatePath('/bahasa');
  const script = data.script as { lines: ListeningResult['lines'] };
  return { ok: true, data: { correct, total: qs.length, band, items, lines: script.lines } };
}
