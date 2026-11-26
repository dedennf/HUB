// Konten dan penilaian bergaya IELTS dari Gemini (D-60). Semua JSON terstruktur, divalidasi Zod.
// Skor yang dihasilkan selalu perkiraan dan ditampilkan begitu ke pengguna.
import { z } from 'zod';
import type { AgentModel } from '@/lib/agent/model';
import { ask, describe, MISTAKE_TYPES, num, str, type EnglishProfile } from './ai';
import type { GrammarTopic } from './ielts';

const band = z.number().min(0).max(9);
const arr = (items: unknown, extra: Record<string, unknown> = {}) => ({ type: 'array', items, ...extra });
const mistakeJson = { type: 'object', properties: { original: str(), fix: str(), type: { type: 'string', enum: MISTAKE_TYPES }, explanation_id: str() }, required: ['original', 'fix', 'type', 'explanation_id'] };
const mistakeSchema = z.object({ original: z.string(), fix: z.string(), type: z.string(), explanation_id: z.string() });
const target = (p: EnglishProfile & { targetBand?: number }) => `Target pengguna: IELTS Academic band ${p.targetBand ?? 6.5}.`;

/* ---------------- 5 kata baru per hari ---------------- */

export const wordsSchema = z.object({
  words: z.array(z.object({
    term: z.string().min(1), part_of_speech: z.string().optional().default(''), meaning_id: z.string(), definition_en: z.string().optional().default(''),
    collocations: z.array(z.string()).optional().default([]), example: z.string().optional().default(''),
  })).min(1).max(8),
});
export type DailyWord = z.infer<typeof wordsSchema>['words'][number];

export function dailyWords(model: AgentModel, p: EnglishProfile & { targetBand?: number }, input: { exclude: string[]; count: number }, signal?: AbortSignal) {
  const system = [
    'Kamu tutor kosakata IELTS Academic.', describe(p), target(p),
    `Pilih ${input.count} kata akademik yang sering berguna di IELTS Writing Task 2 dan Speaking Part 3. Utamakan headword dari Academic Word List (Coxhead, 2000) yang sesuai level.`,
    'Jangan memilih kata yang sudah dikenal pengguna (daftar exclude). Variasikan jenis kata (noun, verb, adjective, adverb).',
    'collocations: 2 sampai 3 kolokasi yang lazim. example: satu kalimat bergaya esai IELTS. meaning_id singkat dalam bahasa Indonesia.',
  ].join('\n');
  const json = {
    type: 'object',
    properties: { words: arr({ type: 'object', properties: { term: str(), part_of_speech: str(), meaning_id: str(), definition_en: str(), collocations: arr(str()), example: str() }, required: ['term', 'meaning_id', 'example'] }) },
    required: ['words'],
  };
  return ask(model, system, `Exclude: ${input.exclude.slice(0, 300).join(', ') || '(belum ada)'}`, json, wordsSchema, signal);
}

export const sentenceSchema = z.object({ correct: z.boolean(), corrected: z.string().optional().default(''), explanation_id: z.string() });
export type SentenceCheck = z.infer<typeof sentenceSchema>;

export function checkSentence(model: AgentModel, p: EnglishProfile, input: { term: string; sentence: string }, signal?: AbortSignal) {
  const system = [
    'Periksa satu kalimat buatan pembelajar yang memakai kata target.', describe(p),
    'correct = true bila kata target dipakai dengan arti dan tata bahasa yang benar (kesalahan kecil tetap disebut di penjelasan).',
    'corrected: versi yang lebih baik dan natural. explanation_id: satu sampai dua kalimat bahasa Indonesia.',
  ].join('\n');
  const json = { type: 'object', properties: { correct: { type: 'boolean' }, corrected: str(), explanation_id: str() }, required: ['correct', 'explanation_id'] };
  return ask(model, system, `Kata target: "${input.term}"\nKalimat: """${input.sentence}"""`, json, sentenceSchema, signal);
}

/* ---------------- grammar harian ---------------- */

export const lessonSchema = z.object({
  explanation_id: z.string(),
  pattern: z.string().optional().default(''),
  examples: z.array(z.object({ en: z.string(), note_id: z.string().optional().default('') })).min(1).max(4),
  exercises: z.array(z.object({ prompt: z.string(), options: z.array(z.string()).min(2).max(4), answer: z.string(), explanation_id: z.string() })).min(3).max(6),
}).refine((l) => l.exercises.every((e) => e.options.includes(e.answer)), { message: 'Jawaban harus salah satu pilihan.' });
export type GrammarLesson = z.infer<typeof lessonSchema>;

export function grammarLesson(model: AgentModel, p: EnglishProfile, topic: GrammarTopic, signal?: AbortSignal) {
  const system = [
    'Kamu guru grammar untuk persiapan IELTS. Penjelasan dalam bahasa Indonesia santai dan ringkas.', describe(p),
    `Topik: ${topic.title} (${topic.level}). Kegunaan di IELTS: ${topic.use}.`,
    'explanation_id: aturan inti maksimal 4 kalimat. pattern: rumus singkat bila ada.',
    'examples: 3 kalimat contoh bertema akademik (pendidikan, riset, teknologi, lingkungan), tiap contoh dengan catatan singkat.',
    'exercises: tepat 5 soal pilihan ganda. Kalimat rumpang memakai ____. 3 pilihan, satu benar. answer persis sama dengan salah satu options. explanation_id menjelaskan kenapa benar.',
    p.topMistakes.length ? `Pengguna sering salah di: ${p.topMistakes.join(', ')}. Sisipkan jebakan yang relevan.` : '',
  ].filter(Boolean).join('\n');
  const json = {
    type: 'object',
    properties: {
      explanation_id: str(), pattern: str(),
      examples: arr({ type: 'object', properties: { en: str(), note_id: str() }, required: ['en'] }),
      exercises: arr({ type: 'object', properties: { prompt: str(), options: arr(str()), answer: str(), explanation_id: str() }, required: ['prompt', 'options', 'answer', 'explanation_id'] }),
    },
    required: ['explanation_id', 'examples', 'exercises'],
  };
  return ask(model, system, 'Buat materi dan latihannya.', json, lessonSchema, signal);
}

/* ---------------- Writing ---------------- */

export const task1Schema = z.object({
  question: z.string(),
  table: z.object({ title: z.string(), unit: z.string().optional().default(''), columns: z.array(z.string()).min(2).max(6), rows: z.array(z.object({ label: z.string(), values: z.array(z.number()) })).min(2).max(8) }),
});
export const task2Schema = z.object({ question: z.string(), type: z.string().optional().default('') });
export type Task1Prompt = z.infer<typeof task1Schema>;
export type WritingPrompt = { task: 1; question: string; table: Task1Prompt['table'] } | { task: 2; question: string };

export async function writingPrompt(model: AgentModel, p: EnglishProfile, task: 1 | 2, signal?: AbortSignal): Promise<WritingPrompt> {
  if (task === 1) {
    const system = [
      'Buat soal IELTS Academic Writing Task 1 berbasis tabel data fiktif yang masuk akal.', describe(p),
      'question: instruksi gaya resmi ("The table below shows ... Summarise the information by selecting and reporting the main features, and make comparisons where relevant."). Akhiri dengan "Write at least 150 words."',
      'table: judul, satuan, 3 sampai 5 kolom (kolom pertama tahun atau kategori waktu), 3 sampai 5 baris. values sebanyak jumlah kolom.',
    ].join('\n');
    const json = {
      type: 'object',
      properties: {
        question: str(),
        table: { type: 'object', properties: { title: str(), unit: str(), columns: arr(str()), rows: arr({ type: 'object', properties: { label: str(), values: arr(num) }, required: ['label', 'values'] }) }, required: ['title', 'columns', 'rows'] },
      },
      required: ['question', 'table'],
    };
    const r = await ask(model, system, 'Topik acak: pendidikan, energi, transportasi, kesehatan, atau penggunaan internet.', json, task1Schema, signal);
    const n = r.table.columns.length;
    return { task: 1, question: r.question, table: { ...r.table, rows: r.table.rows.map((row) => ({ ...row, values: row.values.slice(0, n) })) } };
  }
  const system = [
    'Buat satu soal IELTS Academic Writing Task 2.', describe(p),
    'Variasikan tipe: opinion (agree/disagree), discussion (discuss both views), problem-solution, advantages-disadvantages, two-part question.',
    'question: teks soal gaya resmi, diakhiri "Give reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words."',
  ].join('\n');
  const json = { type: 'object', properties: { question: str(), type: str() }, required: ['question'] };
  const r = await ask(model, system, 'Topik acak yang umum di IELTS.', json, task2Schema, signal);
  return { task: 2, question: r.question };
}

export const writingAssessSchema = z.object({
  bands: z.object({ task: band, coherence: band, lexical: band, grammar: band }),
  notes: z.object({ task: z.string(), coherence: z.string(), lexical: z.string(), grammar: z.string() }),
  mistakes: z.array(mistakeSchema).max(20).optional().default([]),
  improved: z.string().optional().default(''),
  summary_id: z.string().optional().default(''),
});
export type WritingAssessment = z.infer<typeof writingAssessSchema>;

export function assessWriting(model: AgentModel, p: EnglishProfile & { targetBand?: number }, input: { task: 1 | 2; question: string; text: string; words: number; previous?: string }, signal?: AbortSignal) {
  const system = [
    `Kamu penilai berpengalaman IELTS Academic Writing Task ${input.task}. Nilai dengan public band descriptors IELTS (versi Mei 2023).`, describe(p), target(p),
    `Empat kriteria, masing-masing band 0 sampai 9 kelipatan 0,5: ${input.task === 1 ? 'Task Achievement' : 'Task Response'} (task), Coherence and Cohesion (coherence), Lexical Resource (lexical), Grammatical Range and Accuracy (grammar).`,
    `Jumlah kata: ${input.words}. Minimal ${input.task === 1 ? 150 : 250} kata. Bila kurang, turunkan skor task sesuai descriptor.`,
    'Nilai jujur dan konsisten, jangan murah hati. notes: per kriteria satu sampai dua kalimat bahasa Indonesia, sebut apa yang perlu dilakukan untuk naik setengah band.',
    `mistakes: maksimal 10 kesalahan terpenting, type pilih dari: ${MISTAKE_TYPES.join(', ')}.`,
    'improved: tulis ulang 2 sampai 3 kalimat terlemah menjadi versi band 7, bukan seluruh esai. summary_id: satu kalimat prioritas perbaikan.',
    input.previous ? 'Ini revisi. Bandingkan dengan versi sebelumnya dan sebut di summary_id apa yang membaik.' : '',
  ].filter(Boolean).join('\n');
  const crit = { type: 'object', properties: { task: num, coherence: num, lexical: num, grammar: num }, required: ['task', 'coherence', 'lexical', 'grammar'] };
  const notes = { type: 'object', properties: { task: str(), coherence: str(), lexical: str(), grammar: str() }, required: ['task', 'coherence', 'lexical', 'grammar'] };
  const json = { type: 'object', properties: { bands: crit, notes, mistakes: arr(mistakeJson), improved: str(), summary_id: str() }, required: ['bands', 'notes', 'mistakes'] };
  const user = `Soal: """${input.question}"""\n\nJawaban:\n"""${input.text}"""${input.previous ? `\n\nVersi sebelumnya:\n"""${input.previous.slice(0, 4000)}"""` : ''}`;
  return ask(model, system, user, json, writingAssessSchema, signal);
}

/* ---------------- Speaking ---------------- */

export const speakingPromptSchema = z.object({
  questions: z.array(z.string()).optional().default([]),
  cue: z.object({ topic: z.string(), points: z.array(z.string()).min(2).max(5), closing: z.string() }).optional(),
});
export type SpeakingPrompt = z.infer<typeof speakingPromptSchema> & { part: 1 | 2 | 3 };

export async function speakingPrompt(model: AgentModel, p: EnglishProfile, part: 1 | 2 | 3, signal?: AbortSignal): Promise<SpeakingPrompt> {
  const spec = {
    1: 'Part 1: 3 pertanyaan pendek tentang hal sehari-hari (kuliah, tempat tinggal, hobi, kebiasaan) dalam satu tema. Isi questions.',
    2: 'Part 2: satu cue card. cue.topic diawali "Describe ...", cue.points 3 sampai 4 butir "You should say: ...", cue.closing diawali "and explain ...". questions kosong.',
    3: 'Part 3: 2 pertanyaan diskusi abstrak yang menuntut opini, perbandingan, atau prediksi. Isi questions.',
  }[part];
  const system = ['Buat soal IELTS Speaking gaya resmi.', describe(p), spec].join('\n');
  const json = {
    type: 'object',
    properties: { questions: arr(str()), cue: { type: 'object', properties: { topic: str(), points: arr(str()), closing: str() }, required: ['topic', 'points', 'closing'] } },
  };
  const r = await ask(model, system, 'Tema acak yang umum di IELTS.', json, speakingPromptSchema, signal);
  if (part === 2 && !r.cue) throw new Error('Cue card kosong.');
  if (part !== 2 && !r.questions.length) throw new Error('Pertanyaan kosong.');
  return { ...r, part };
}

export const speakingAssessSchema = z.object({
  transcript: z.string(),
  heard_speech: z.boolean().optional().default(true),
  bands: z.object({ fluency: band, lexical: band, grammar: band, pronunciation: band }).optional(),
  notes: z.object({ fluency: z.string(), lexical: z.string(), grammar: z.string(), pronunciation: z.string() }).optional(),
  mistakes: z.array(mistakeSchema).max(12).optional().default([]),
  better: z.string().optional().default(''),
  summary_id: z.string().optional().default(''),
});
export type SpeakingAssessment = z.infer<typeof speakingAssessSchema>;

export function assessSpeaking(model: AgentModel, p: EnglishProfile & { targetBand?: number }, input: { part: 1 | 2 | 3; prompt: string; seconds: number; audio: { data: Buffer; mime: string } }, signal?: AbortSignal) {
  const system = [
    `Kamu penguji IELTS Speaking. Ini jawaban untuk Part ${input.part}, durasi ${Math.round(input.seconds)} detik.`, describe(p), target(p),
    'Tulis transkrip apa adanya, termasuk jeda isi seperti "um". JANGAN mengarang bila tidak ada ucapan: heard_speech = false dan transkrip kosong.',
    'bands 0 sampai 9 kelipatan 0,5 untuk Fluency and Coherence (fluency), Lexical Resource (lexical), Grammatical Range and Accuracy (grammar), Pronunciation (pronunciation).',
    input.part === 2 && input.seconds < 75 ? 'Jawaban Part 2 jauh di bawah 2 menit, ini menurunkan fluency.' : '',
    'Penilaian pronunciation dari rekaman bersifat kasar, sebut itu di notes.pronunciation. notes per kriteria satu kalimat bahasa Indonesia, berisi cara naik setengah band.',
    `mistakes: maksimal 6, type pilih dari: ${MISTAKE_TYPES.join(', ')}. better: contoh jawaban band 7 yang singkat dengan isi yang sama. summary_id: satu kalimat prioritas.`,
  ].filter(Boolean).join('\n');
  const four = (t: unknown) => ({ type: 'object', properties: { fluency: t, lexical: t, grammar: t, pronunciation: t }, required: ['fluency', 'lexical', 'grammar', 'pronunciation'] });
  const json = {
    type: 'object',
    properties: { transcript: str(), heard_speech: { type: 'boolean' }, bands: four(num), notes: four(str()), mistakes: arr(mistakeJson), better: str(), summary_id: str() },
    required: ['transcript', 'heard_speech'],
  };
  return ask(model, system, `Soal:\n${input.prompt}\nNilai rekaman jawaban ini.`, json, speakingAssessSchema, signal, input.audio);
}

/* ---------------- Reading ---------------- */

export const readingSchema = z.object({
  title: z.string(),
  passage: z.string().min(200),
  translation_paragraphs: z.array(z.string()).optional().default([]),
  questions: z.array(z.object({
    type: z.enum(['tfng', 'mcq']), prompt: z.string(), options: z.array(z.string()).min(2).max(4), answer: z.string(), explanation_id: z.string(),
  })).min(4).max(8),
}).refine((r) => r.questions.every((q) => q.options.includes(q.answer)), { message: 'Jawaban harus salah satu pilihan.' });
export type ReadingSet = z.infer<typeof readingSchema>;

export function readingSet(model: AgentModel, p: EnglishProfile, signal?: AbortSignal) {
  const system = [
    'Buat latihan IELTS Academic Reading versi pendek.', describe(p),
    'passage: 3 sampai 4 paragraf, total 320 sampai 400 kata, gaya artikel ilmiah populer (sains, sosial, sejarah, teknologi). Tingkat kesulitan setara IELTS.',
    'questions: tepat 6 soal. 3 bertipe tfng dengan options persis ["TRUE", "FALSE", "NOT GIVEN"], dan 3 bertipe mcq dengan 4 pilihan.',
    'Soal TRUE/FALSE/NOT GIVEN harus bisa dibuktikan dari teks, NOT GIVEN berarti teks tidak menyebutnya. answer persis sama dengan salah satu options.',
    'explanation_id: bahasa Indonesia, kutip bagian teks yang jadi bukti.',
    'translation_paragraphs: terjemahan bahasa Indonesia yang natural untuk tiap paragraf passage, berurutan dan jumlahnya sama dengan paragraf.',
  ].join('\n');
  const json = {
    type: 'object',
    properties: {
      title: str(), passage: str(), translation_paragraphs: arr(str()),
      questions: arr({ type: 'object', properties: { type: { type: 'string', enum: ['tfng', 'mcq'] }, prompt: str(), options: arr(str()), answer: str(), explanation_id: str() }, required: ['type', 'prompt', 'options', 'answer', 'explanation_id'] }),
    },
    required: ['title', 'passage', 'questions'],
  };
  return ask(model, system, 'Topik acak.', json, readingSchema, signal);
}

/* ---------------- Listening (D-65) ---------------- */

export const listeningSchema = z.object({
  title: z.string(),
  speakers: z.array(z.object({ name: z.string().min(1).max(20), gender: z.enum(['female', 'male']) })).min(1).max(2),
  lines: z.array(z.object({ speaker: z.string(), text: z.string().min(1), translation_id: z.string() })).min(4).max(40),
  questions: z.array(z.object({
    type: z.enum(['gap', 'mcq']), prompt: z.string(), options: z.array(z.string()).optional().default([]),
    answer: z.string().min(1), accept: z.array(z.string()).optional().default([]), explanation_id: z.string(),
  })).min(4).max(8),
}).refine((s) => s.questions.every((q) => q.type === 'gap' || q.options.includes(q.answer)), { message: 'Jawaban pilihan ganda harus salah satu pilihan.' })
  .refine((s) => s.lines.every((l) => s.speakers.some((sp) => sp.name === l.speaker)), { message: 'Setiap baris harus milik pembicara yang terdaftar.' });
export type ListeningScript = z.infer<typeof listeningSchema>;

export function listeningScript(model: AgentModel, p: EnglishProfile, section: 1 | 4, signal?: AbortSignal) {
  const spec = section === 1
    ? 'Section 1: percakapan dua orang tentang urusan sehari-hari (memesan, mendaftar, bertanya informasi). speakers dua orang, satu female dan satu male, nama Inggris pendek. 14 sampai 22 baris, total 300 sampai 380 kata. Sisipkan detail yang lazim ditanyakan: nama dieja, angka, tanggal, harga, alamat.'
    : 'Section 4: ceramah akademik satu pembicara (dosen) tentang topik ilmiah populer. speakers satu orang. Bagi jadi 8 sampai 14 baris (tiap baris satu sampai tiga kalimat), total 330 sampai 400 kata.';
  const system = [
    'Buat latihan IELTS Listening versi pendek. Naskah akan dibacakan mesin suara, jadi tulis seperti ucapan alami.', describe(p), spec,
    'Setiap baris: speaker (nama persis seperti di speakers), text bahasa Inggris, translation_id terjemahan bahasa Indonesia yang natural dan mudah dipahami.',
    'questions: tepat 6 soal berurutan sesuai alur rekaman. 3 bertipe gap (isian, jawaban maksimal tiga kata atau satu angka, prompt memakai ____), 3 bertipe mcq dengan 3 pilihan.',
    'Untuk gap: answer persis seperti diucapkan, accept berisi variasi yang juga benar (mis. "15" dan "fifteen", "Tuesday" dan "Tue"). Untuk mcq: answer persis sama dengan salah satu options, kosongkan accept.',
    'Jawaban harus terdengar jelas di naskah. Sertakan pengecoh yang wajar (mis. pembicara meralat angka). explanation_id: bahasa Indonesia, kutip kalimat naskah yang menjadi bukti.',
  ].join('\n');
  const json = {
    type: 'object',
    properties: {
      title: str(),
      speakers: arr({ type: 'object', properties: { name: str(), gender: { type: 'string', enum: ['female', 'male'] } }, required: ['name', 'gender'] }),
      lines: arr({ type: 'object', properties: { speaker: str(), text: str(), translation_id: str() }, required: ['speaker', 'text', 'translation_id'] }),
      questions: arr({ type: 'object', properties: { type: { type: 'string', enum: ['gap', 'mcq'] }, prompt: str(), options: arr(str()), answer: str(), accept: arr(str()), explanation_id: str() }, required: ['type', 'prompt', 'answer', 'explanation_id'] }),
    },
    required: ['title', 'speakers', 'lines', 'questions'],
  };
  return ask(model, system, 'Topik acak yang umum di IELTS.', json, listeningSchema, signal);
}
