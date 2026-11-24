// Tools bahasa Inggris (SPEC 6.8, 10). Bagian yang butuh penalaran bahasa (koreksi, penjelasan)
// dikerjakan Gemini sendiri. Tool ini menyediakan data dan menyimpan hasil (D-35).
import { z } from 'zod';
import { review } from '../../english/srs';
import { addDays, zonedParts, zonedToIso } from '../../time';
import { saveSubmission } from '../../english/store';
import { insertRow, isErr } from './common';
import { fail, type ReadTool, type UndoOp, type WriteTool } from './types';

const vocabParams = z.object({
  term: z.string().min(1).max(120),
  meaning_id: z.string().max(300).optional().describe('Arti dalam bahasa Indonesia'),
  definition_en: z.string().max(500).optional(),
  example: z.string().max(500).optional(),
  part_of_speech: z.string().max(30).optional(),
  source_type: z.enum(['manual', 'reading', 'mistake', 'agent']).optional(),
  source_ref: z.uuid().optional().describe('Id bacaan atau tulisan asal'),
});
export const saveVocab: WriteTool<typeof vocabParams, Record<string, unknown>> = {
  name: 'save_vocab', module: 'english', permission: 'write',
  description: 'Simpan kosakata bahasa Inggris ke bank kata untuk diulang (spaced repetition).',
  parameters: vocabParams,
  async prepare(ctx, a) {
    const { data } = await ctx.db.from('vocab').select('id').ilike('term', a.term).limit(1);
    if (data?.length) return fail(`"${a.term}" sudah ada di bank kata.`, { field: 'term' });
    return { ok: true, summary: `Kosakata: ${a.term}${a.meaning_id ? ` = ${a.meaning_id}` : ''}`, resolved: { ...a, source_type: a.source_type ?? 'agent', due_at: ctx.now.toISOString() } };
  },
  async commit(ctx, r) {
    const res = await insertRow(ctx, 'vocab', r);
    if (isErr(res)) return res;
    return { ok: true, data: { id: res.id }, undo: { ops: [res.undo] } };
  },
};

export const getDueReviews: ReadTool<z.ZodObject<{ limit: z.ZodOptional<z.ZodNumber> }>> = {
  name: 'get_due_reviews', module: 'english', permission: 'read',
  description: 'Kosakata yang jatuh tempo untuk diulang sekarang.',
  parameters: z.object({ limit: z.number().int().min(1).max(50).optional() }),
  async run(ctx, { limit }) {
    const { data, count } = await ctx.db.from('vocab').select('id,term,meaning_id,example,repetitions,interval_days', { count: 'exact' }).lte('due_at', ctx.now.toISOString()).order('due_at').limit(limit ?? 10);
    return { ok: true, data: { due_total: count ?? 0, items: data ?? [] } };
  },
};

const gradeParams = z.object({ vocab_id: z.uuid(), grade: z.number().int().min(0).max(5).describe('Lupa 1, Sulit 3, Bisa 4, Mudah 5') });
type GradeResolved = { vocab_id: string; grade: number; next: Record<string, unknown> };
export const gradeReview: WriteTool<typeof gradeParams, GradeResolved> = {
  name: 'grade_review', module: 'english', permission: 'write',
  description: 'Catat nilai review satu kosakata dan jadwalkan ulang (SM-2).',
  parameters: gradeParams,
  async prepare(ctx, a) {
    const { data: v } = await ctx.db.from('vocab').select('term,ease,interval_days,repetitions,lapses').eq('id', a.vocab_id).maybeSingle();
    if (!v) return fail('Kosakata tidak ditemukan.', { field: 'vocab_id' });
    const next = review({ ease: Number(v.ease), interval_days: v.interval_days, repetitions: v.repetitions, lapses: v.lapses }, a.grade, ctx.now);
    return { ok: true, summary: `Review ${v.term}: nilai ${a.grade}, ulang lagi ${next.interval_days} hari`, resolved: { vocab_id: a.vocab_id, grade: a.grade, next } };
  },
  async commit(ctx, r) {
    const { data: old } = await ctx.db.from('vocab').select('ease,interval_days,repetitions,lapses,due_at').eq('id', r.vocab_id).maybeSingle();
    if (!old) return fail('Kosakata tidak ditemukan.');
    const { error } = await ctx.db.from('vocab').update(r.next).eq('id', r.vocab_id);
    if (error) return fail(error.message);
    const rev = await insertRow(ctx, 'vocab_reviews', { vocab_id: r.vocab_id, grade: r.grade });
    if (isErr(rev)) return rev;
    const ops: UndoOp[] = [{ op: 'update', table: 'vocab', id: r.vocab_id, values: old }, rev.undo];
    return { ok: true, data: { id: r.vocab_id, ...r.next }, undo: { ops } };
  },
};

const writingParams = z.object({
  text: z.string().min(1).max(4000).describe('Tulisan asli pengguna'),
  kind: z.enum(['free', 'summary', 'abstract', 'journal', 'english_mode']).optional(),
  corrected: z.string().max(6000).describe('Versi yang sudah dikoreksi (dibuat model)'),
  mistakes: z.array(z.object({ original: z.string(), fix: z.string(), type: z.string().describe('mis. "article a/an/the", "subject-verb agreement"'), explanation_id: z.string() })).max(30),
  score: z.object({ grammar: z.number().min(0).max(10), vocabulary: z.number().min(0).max(10), clarity: z.number().min(0).max(10) }).optional(),
});
export const correctWriting: WriteTool<typeof writingParams, z.infer<typeof writingParams>> = {
  name: 'correct_writing', module: 'english', permission: 'write',
  description: 'Simpan hasil koreksi tulisan bahasa Inggris yang sudah kamu buat (versi koreksi, daftar kesalahan, skor) dan perbarui pola kesalahan pengguna.',
  parameters: writingParams,
  async prepare(_ctx, a) {
    return { ok: true, summary: `Koreksi tulisan: ${a.mistakes.length} catatan`, resolved: a };
  },
  async commit(ctx, r) {
    const res = await saveSubmission(ctx.db, { kind: r.kind ?? 'free', original: r.text, corrected: r.corrected, mistakes: r.mistakes, score: r.score ?? null }, ctx.now);
    return { ok: true, data: { id: res.id }, undo: { ops: res.undo } };
  },
};

export const startPractice: ReadTool<z.ZodObject<{ kind: z.ZodEnum<{ review: 'review'; reading: 'reading'; writing: 'writing'; speaking: 'speaking' }>; topic: z.ZodOptional<z.ZodString> }>> = {
  name: 'start_practice', module: 'english', permission: 'read',
  description: 'Bahan untuk menyusun latihan adaptif: level, tujuan, pola kesalahan teratas, dan kosakata jatuh tempo. Susun latihannya sendiri dari data ini.',
  parameters: z.object({ kind: z.enum(['review', 'reading', 'writing', 'speaking']), topic: z.string().max(120).optional() }),
  async run(ctx, a) {
    const [{ data: settings }, { data: patterns }, { data: due }] = await Promise.all([
      ctx.db.from('settings').select('key,value').in('key', ['english_level', 'english_goal', 'english_daily_minutes', 'english_correction_level']),
      ctx.db.from('mistake_patterns').select('pattern,count,example').order('count', { ascending: false }).limit(3),
      ctx.db.from('vocab').select('id,term,meaning_id').lte('due_at', ctx.now.toISOString()).order('due_at').limit(10),
    ]);
    return { ok: true, data: { kind: a.kind, topic: a.topic ?? null, settings: Object.fromEntries((settings ?? []).map((s) => [s.key, s.value])), top_mistakes: patterns ?? [], due_vocab: due ?? [] } };
  },
};

export const explainText: ReadTool<z.ZodObject<{ text: z.ZodString }>> = {
  name: 'explain_text', module: 'english', permission: 'read',
  description: 'Bahan untuk menjelaskan teks bahasa Inggris: level pengguna dan kata di teks yang sudah ada di bank kata. Penjelasan dan pemecahan kalimat kamu tulis sendiri.',
  parameters: z.object({ text: z.string().min(1).max(4000) }),
  async run(ctx, { text }) {
    const words = [...new Set(text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [])].slice(0, 200);
    const [{ data: level }, { data: known }] = await Promise.all([
      ctx.db.from('settings').select('value').eq('key', 'english_level').maybeSingle(),
      words.length ? ctx.db.from('vocab').select('term,meaning_id').in('term', words) : Promise.resolve({ data: [] }),
    ]);
    return { ok: true, data: { level: level?.value ?? 'intermediate', known_terms: known ?? [] } };
  },
};

export const getEnglishProgress: ReadTool<z.ZodObject<{ period: z.ZodOptional<z.ZodEnum<{ week: 'week'; month: 'month' }>> }>> = {
  name: 'get_english_progress', module: 'english', permission: 'read',
  description: 'Progres bahasa Inggris: jumlah kata, kata dikuasai (interval ≥ 21 hari), review dan sesi latihan dalam periode, streak, dan pola kesalahan teratas.',
  parameters: z.object({ period: z.enum(['week', 'month']).optional() }),
  async run(ctx, { period }) {
    const from = addDays(ctx.today, period === 'month' ? -29 : -6);
    const [{ count: total }, { count: mastered }, { data: reviews }, { data: sessions }, { data: patterns }] = await Promise.all([
      ctx.db.from('vocab').select('id', { count: 'exact', head: true }),
      ctx.db.from('vocab').select('id', { count: 'exact', head: true }).gte('interval_days', 21),
      ctx.db.from('vocab_reviews').select('created_at').gte('created_at', zonedToIso(addDays(ctx.today, -60))),
      ctx.db.from('practice_sessions').select('kind,duration_seconds,created_at').gte('created_at', zonedToIso(from)),
      ctx.db.from('mistake_patterns').select('pattern,count').order('count', { ascending: false }).limit(3),
    ]);
    const days = new Set((reviews ?? []).map((r) => zonedParts(r.created_at).date));
    let streak = 0;
    for (let d = days.has(ctx.today) ? ctx.today : addDays(ctx.today, -1); days.has(d); d = addDays(d, -1)) streak++;
    return {
      ok: true,
      data: { vocab_total: total ?? 0, mastered: mastered ?? 0, reviews_in_period: (reviews ?? []).filter((r) => zonedParts(r.created_at).date >= from).length, sessions: sessions ?? [], streak_days: streak, top_mistakes: patterns ?? [] },
    };
  },
};

export const englishTools = [saveVocab, getDueReviews, gradeReview, correctWriting, startPractice, explainText, getEnglishProgress];
