// Penalaran bahasa Inggris dengan Gemini (SPEC 10.2). Semua memakai output JSON terstruktur dan divalidasi Zod.
// Penjelasan untuk pengguna selalu dalam bahasa Indonesia.
import { z } from 'zod';
import type { AgentModel } from '@/lib/agent/model';

export type EnglishProfile = { level: string; goal: string; correction: string; topMistakes: string[] };

const LEVEL: Record<string, string> = { beginner: 'pemula (A2)', intermediate: 'menengah (B1-B2)', upper_intermediate: 'menengah atas (B2-C1)' };
const GOAL: Record<string, string> = {
  academic_general: 'bahasa Inggris akademik untuk jurnal dan menulis, plus percakapan umum', toefl: 'persiapan TOEFL', ielts: 'persiapan IELTS',
  conversation: 'percakapan sehari-hari', career: 'karier dan wawancara kerja',
};
const describe = (p: EnglishProfile) => `Pengguna: mahasiswa Indonesia, level ${LEVEL[p.level] ?? p.level}, tujuan ${GOAL[p.goal] ?? p.goal}.`;

function parseJson<T>(schema: z.ZodType<T>, raw: string): T {
  return schema.parse(JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')));
}

async function ask<T>(model: AgentModel, system: string, user: string, json: unknown, schema: z.ZodType<T>, signal?: AbortSignal, audio?: { data: Buffer; mime: string }): Promise<T> {
  const parts = audio ? [{ inlineData: { mimeType: audio.mime, data: audio.data.toString('base64') } }, { text: user }] : [{ text: user }];
  const turn = await model.generate({ system, contents: [{ role: 'user', parts }], tools: [], json, thinking: 'low', signal });
  return parseJson(schema, turn.text);
}

const str = (d?: string) => ({ type: 'string', ...(d ? { description: d } : {}) });
const num = { type: 'number' };

/* ---------------- jelaskan dan pecah kalimat (membaca berpendamping) ---------------- */

export const explainSchema = z.object({
  translation_id: z.string(),
  explanation_id: z.string(),
  parts: z.array(z.object({ text: z.string(), translation_id: z.string(), grammar_id: z.string() })).optional().default([]),
  vocab: z.array(z.object({ term: z.string(), meaning_id: z.string(), part_of_speech: z.string().optional().default('') })).optional().default([]),
});
export type Explanation = z.infer<typeof explainSchema>;

export function explainText(model: AgentModel, p: EnglishProfile, input: { text: string; context?: string; breakdown: boolean }, signal?: AbortSignal) {
  const system = [
    'Kamu tutor bahasa Inggris yang menjelaskan dalam bahasa Indonesia santai dan ringkas.', describe(p),
    input.breakdown
      ? 'Mode PECAH KALIMAT: bagi kalimat panjang jadi bagian bermakna (klausa atau frasa). Tiap bagian: teks asli, terjemahan, dan fungsi gramatikalnya.'
      : 'Mode JELASKAN: terjemahkan teks, jelaskan arti dan nuansanya dalam konteks, maksimal 4 kalimat.',
    'vocab: maksimal 5 kata atau frasa penting yang mungkin belum dikenal pada level ini, dalam bentuk dasar (lemma).',
  ].join('\n');
  const json = {
    type: 'object',
    properties: {
      translation_id: str('Terjemahan bahasa Indonesia'), explanation_id: str('Penjelasan singkat bahasa Indonesia'),
      parts: { type: 'array', items: { type: 'object', properties: { text: str(), translation_id: str(), grammar_id: str('Fungsi gramatikal, bahasa Indonesia') }, required: ['text', 'translation_id', 'grammar_id'] } },
      vocab: { type: 'array', items: { type: 'object', properties: { term: str(), meaning_id: str(), part_of_speech: str() }, required: ['term', 'meaning_id'] } },
    },
    required: ['translation_id', 'explanation_id'],
  };
  const user = `Teks: """${input.text}"""${input.context ? `\nKonteks kalimat: """${input.context}"""` : ''}`;
  return ask(model, system, user, json, explainSchema, signal);
}

/* ---------------- entri kosakata ---------------- */

export const vocabEntrySchema = z.object({
  term: z.string().min(1), meaning_id: z.string(), definition_en: z.string().optional().default(''),
  part_of_speech: z.string().optional().default(''), example: z.string().optional().default(''),
});
export type VocabEntry = z.infer<typeof vocabEntrySchema>;

export function vocabEntry(model: AgentModel, p: EnglishProfile, input: { term: string; context?: string }, signal?: AbortSignal) {
  const system = [
    'Buat entri bank kata untuk pembelajar bahasa Inggris.', describe(p),
    'term dalam bentuk dasar (lemma, mis. "shows" menjadi "show") kecuali frasa tetap. meaning_id sesuai konteks bila ada.',
    'example: satu kalimat contoh. Bila ada konteks, pakai kalimat konteks itu apa adanya.',
  ].join('\n');
  const json = {
    type: 'object',
    properties: { term: str(), meaning_id: str('Arti singkat bahasa Indonesia'), definition_en: str('Definisi singkat bahasa Inggris'), part_of_speech: str('noun, verb, adjective, phrase, ...'), example: str() },
    required: ['term', 'meaning_id'],
  };
  return ask(model, system, `Kata: "${input.term}"${input.context ? `\nKonteks: """${input.context}"""` : ''}`, json, vocabEntrySchema, signal);
}

/* ---------------- koreksi tulisan ---------------- */

export const correctionSchema = z.object({
  corrected: z.string(),
  mistakes: z.array(z.object({ original: z.string(), fix: z.string(), type: z.string(), explanation_id: z.string() })).max(30).optional().default([]),
  score: z.object({ grammar: z.number().min(0).max(10), vocabulary: z.number().min(0).max(10), clarity: z.number().min(0).max(10) }),
  summary_id: z.string().optional().default(''),
});
export type Correction = z.infer<typeof correctionSchema>;

/** Jenis kesalahan baku supaya mistake_patterns terkumpul rapi (SPEC 10.2.3). */
export const MISTAKE_TYPES = [
  'article a/an/the', 'subject-verb agreement', 'verb tense', 'preposition', 'plural/singular', 'word choice', 'word order',
  'spelling', 'punctuation', 'pronoun', 'collocation', 'sentence structure', 'formality/register',
];

export function correctWriting(model: AgentModel, p: EnglishProfile, input: { text: string; kind: string; onlyImportant?: boolean }, signal?: AbortSignal) {
  const system = [
    'Kamu editor bahasa Inggris yang mengoreksi tulisan mahasiswa Indonesia.', describe(p),
    `Jenis tulisan: ${input.kind}. Pertahankan maksud dan gaya penulis, perbaiki seperlunya.`,
    input.onlyImportant ? 'Catat hanya kesalahan penting (yang mengubah makna atau jelas salah tata bahasa).' : 'Catat semua kesalahan, termasuk yang kecil.',
    `type kesalahan pilih dari: ${MISTAKE_TYPES.join(', ')}.`,
    'explanation_id: penjelasan satu kalimat dalam bahasa Indonesia. score 0 sampai 10. summary_id: satu kalimat saran utama.',
  ].join('\n');
  const json = {
    type: 'object',
    properties: {
      corrected: str('Versi yang sudah dikoreksi'),
      mistakes: { type: 'array', items: { type: 'object', properties: { original: str(), fix: str(), type: { type: 'string', enum: MISTAKE_TYPES }, explanation_id: str() }, required: ['original', 'fix', 'type', 'explanation_id'] } },
      score: { type: 'object', properties: { grammar: num, vocabulary: num, clarity: num }, required: ['grammar', 'vocabulary', 'clarity'] },
      summary_id: str(),
    },
    required: ['corrected', 'mistakes', 'score'],
  };
  return ask(model, system, input.text, json, correctionSchema, signal);
}

/* ---------------- latihan bicara tingkat 1 ---------------- */

export const questionSchema = z.object({ question: z.string(), hint_id: z.string().optional().default(''), topic: z.string().optional().default('') });

export function speakingQuestion(model: AgentModel, p: EnglishProfile, input: { topic?: string }, signal?: AbortSignal) {
  const system = [
    'Kamu partner latihan bicara bahasa Inggris.', describe(p),
    'Buat SATU pertanyaan terbuka yang bisa dijawab lisan 30 sampai 60 detik, sesuai level dan tujuan pengguna.',
    p.topMistakes.length ? `Pancing penggunaan pola yang sering salah: ${p.topMistakes.join(', ')}.` : '',
    'hint_id: satu kalimat petunjuk dalam bahasa Indonesia tentang apa yang bisa diceritakan.',
  ].filter(Boolean).join('\n');
  const json = { type: 'object', properties: { question: str(), hint_id: str(), topic: str() }, required: ['question'] };
  return ask(model, system, input.topic ? `Topik: ${input.topic}` : 'Topik bebas: kuliah, riset, presentasi, atau kehidupan sehari-hari.', json, questionSchema, signal);
}

export const speakingSchema = z.object({
  transcript: z.string(),
  heard_speech: z.boolean().optional().default(true),
  content_id: z.string().optional().default(''),
  grammar: z.array(z.object({ original: z.string(), fix: z.string(), type: z.string(), explanation_id: z.string() })).optional().default([]),
  word_choice: z.array(z.object({ original: z.string(), better: z.string(), explanation_id: z.string() })).optional().default([]),
  natural_version: z.string().optional().default(''),
  pronunciation_id: z.string().optional().default(''),
  score: z.object({ content: z.number(), grammar: z.number(), vocabulary: z.number(), fluency: z.number() }).optional(),
});
export type SpeakingFeedback = z.infer<typeof speakingSchema>;

export function evaluateSpeaking(model: AgentModel, p: EnglishProfile, input: { question: string; audio: { data: Buffer; mime: string } }, signal?: AbortSignal) {
  const system = [
    'Kamu penilai latihan bicara bahasa Inggris.', describe(p),
    'Dengarkan jawaban lisan atas pertanyaan yang diberikan. Tulis transkrip apa adanya. JANGAN mengarang bila tidak ada ucapan: isi heard_speech = false dan transkrip kosong.',
    'Nilai isi jawaban (content_id), tata bahasa (grammar), dan pilihan kata (word_choice). Beri versi yang lebih natural (natural_version) tanpa mengubah maksud.',
    `type tata bahasa pilih dari: ${MISTAKE_TYPES.join(', ')}.`,
    'pronunciation_id: catatan pelafalan singkat dalam bahasa Indonesia, akui bahwa penilaian ini kasar. Semua penjelasan bahasa Indonesia. score 0 sampai 10.',
  ].join('\n');
  const json = {
    type: 'object',
    properties: {
      transcript: str(), heard_speech: { type: 'boolean' }, content_id: str(),
      grammar: { type: 'array', items: { type: 'object', properties: { original: str(), fix: str(), type: { type: 'string', enum: MISTAKE_TYPES }, explanation_id: str() }, required: ['original', 'fix', 'type', 'explanation_id'] } },
      word_choice: { type: 'array', items: { type: 'object', properties: { original: str(), better: str(), explanation_id: str() }, required: ['original', 'better', 'explanation_id'] } },
      natural_version: str(), pronunciation_id: str(),
      score: { type: 'object', properties: { content: num, grammar: num, vocabulary: num, fluency: num }, required: ['content', 'grammar', 'vocabulary', 'fluency'] },
    },
    required: ['transcript', 'heard_speech'],
  };
  return ask(model, system, `Pertanyaan: "${input.question}"\nNilai rekaman jawaban ini.`, json, speakingSchema, signal, input.audio);
}

/* ---------------- English Mode ---------------- */

export const modeFeedbackSchema = z.object({
  is_english: z.boolean(),
  corrected: z.string().optional().default(''),
  notes: z.array(z.object({ original: z.string(), fix: z.string(), type: z.string(), explanation_id: z.string() })).max(5).optional().default([]),
});
export type ModeFeedback = z.infer<typeof modeFeedbackSchema>;

export function englishModeFeedback(model: AgentModel, p: EnglishProfile, input: { text: string }, signal?: AbortSignal) {
  const system = [
    'Pengguna memberi perintah ke asisten dalam bahasa Inggris untuk berlatih. Beri umpan balik bahasa yang sangat singkat.', describe(p),
    'is_english = false bila pesan bukan bahasa Inggris (mis. bahasa Indonesia): kosongkan lainnya.',
    p.correction === 'all' ? 'Catat semua kesalahan (maksimal 5).' : 'Catat hanya kesalahan penting (maksimal 3). Abaikan gaya informal yang wajar untuk chat.',
    `type pilih dari: ${MISTAKE_TYPES.join(', ')}. corrected: versi yang benar, kosong bila sudah benar. explanation_id bahasa Indonesia, satu kalimat.`,
  ].join('\n');
  const json = {
    type: 'object',
    properties: {
      is_english: { type: 'boolean' }, corrected: str(),
      notes: { type: 'array', items: { type: 'object', properties: { original: str(), fix: str(), type: { type: 'string', enum: MISTAKE_TYPES }, explanation_id: str() }, required: ['original', 'fix', 'type', 'explanation_id'] } },
    },
    required: ['is_english'],
  };
  return ask(model, system, input.text, json, modeFeedbackSchema, signal);
}
