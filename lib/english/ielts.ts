// Persiapan IELTS (D-60): kurikulum grammar, rotasi skill harian, dan perhitungan perkiraan band. Fungsi murni.
import { isoWeekday } from '@/lib/time';

export type Level = 'B1' | 'B2' | 'C1';
export type GrammarTopic = { key: string; title: string; level: Level; mistakes: string[]; use: string };

/**
 * Urutan grammar dari B1 ke C1, dipilih yang paling berguna untuk IELTS Writing dan Speaking.
 * `mistakes` memakai MISTAKE_TYPES supaya topik yang berkaitan dengan kesalahanmu didahulukan.
 */
export const GRAMMAR_TOPICS: GrammarTopic[] = [
  { key: 'articles', title: 'Articles: a, an, the, zero article', level: 'B1', mistakes: ['article a/an/the'], use: 'Semua tugas, kesalahan paling umum penutur bahasa Indonesia' },
  { key: 'sva', title: 'Subject-verb agreement', level: 'B1', mistakes: ['subject-verb agreement'], use: 'Writing Task 2, Speaking' },
  { key: 'present-perfect', title: 'Present perfect vs past simple', level: 'B1', mistakes: ['verb tense'], use: 'Speaking Part 1 dan 2' },
  { key: 'countable', title: 'Countable and uncountable nouns', level: 'B1', mistakes: ['plural/singular'], use: 'Writing Task 1 dan 2' },
  { key: 'prepositions', title: 'Prepositions of time, place, and change', level: 'B1', mistakes: ['preposition'], use: 'Writing Task 1 (rose by, fell to)' },
  { key: 'comparatives', title: 'Comparatives and superlatives', level: 'B1', mistakes: ['word choice', 'sentence structure'], use: 'Writing Task 1, membandingkan data' },
  { key: 'modals', title: 'Modal verbs for advice, obligation, possibility', level: 'B1', mistakes: ['verb tense', 'word choice'], use: 'Writing Task 2, solusi dan saran' },
  { key: 'conditionals-12', title: 'First and second conditional', level: 'B2', mistakes: ['verb tense', 'sentence structure'], use: 'Writing Task 2, Speaking Part 3' },
  { key: 'conditionals-3', title: 'Third and mixed conditional', level: 'B2', mistakes: ['verb tense', 'sentence structure'], use: 'Speaking Part 2 dan 3' },
  { key: 'passive', title: 'Passive voice in academic writing', level: 'B2', mistakes: ['verb tense', 'sentence structure'], use: 'Writing Task 1 (proses), Task 2' },
  { key: 'relative', title: 'Defining and non-defining relative clauses', level: 'B2', mistakes: ['sentence structure', 'punctuation', 'pronoun'], use: 'Kalimat kompleks untuk Grammatical Range' },
  { key: 'gerund-infinitive', title: 'Gerund or infinitive after verbs', level: 'B2', mistakes: ['word choice', 'sentence structure'], use: 'Speaking dan Writing' },
  { key: 'contrast', title: 'Linking contrast: although, however, whereas', level: 'B2', mistakes: ['sentence structure', 'punctuation'], use: 'Coherence and Cohesion' },
  { key: 'cause-effect', title: 'Cause and effect: due to, as a result, therefore', level: 'B2', mistakes: ['sentence structure', 'word choice'], use: 'Writing Task 2' },
  { key: 'quantifiers', title: 'Quantifiers: a number of, the amount of, the proportion of', level: 'B2', mistakes: ['plural/singular', 'collocation'], use: 'Writing Task 1' },
  { key: 'trends', title: 'Describing trends: rose sharply, a slight decline', level: 'B2', mistakes: ['collocation', 'word choice', 'preposition'], use: 'Writing Task 1' },
  { key: 'future', title: 'Future forms and predictions', level: 'B2', mistakes: ['verb tense'], use: 'Writing Task 1 (proyeksi), Speaking Part 3' },
  { key: 'reported', title: 'Reporting verbs: argue, claim, suggest', level: 'B2', mistakes: ['verb tense', 'word choice'], use: 'Writing Task 2, menyebut pendapat orang lain' },
  { key: 'word-order', title: 'Adverb and adjective word order', level: 'B2', mistakes: ['word order'], use: 'Semua tugas' },
  { key: 'pronoun-reference', title: 'Pronoun reference: this, these, which, it', level: 'B2', mistakes: ['pronoun'], use: 'Coherence and Cohesion' },
  { key: 'nominalisation', title: 'Nominalisation: from verbs to nouns', level: 'C1', mistakes: ['formality/register', 'word choice'], use: 'Writing Task 2, gaya akademik' },
  { key: 'hedging', title: 'Hedging: tend to, it could be argued, likely', level: 'C1', mistakes: ['formality/register'], use: 'Writing Task 2, Speaking Part 3' },
  { key: 'participle', title: 'Participle clauses', level: 'C1', mistakes: ['sentence structure'], use: 'Grammatical Range' },
  { key: 'cleft', title: 'Cleft sentences for emphasis', level: 'C1', mistakes: ['sentence structure', 'word order'], use: 'Speaking Part 3' },
  { key: 'inversion', title: 'Inversion: not only, rarely, no sooner', level: 'C1', mistakes: ['word order'], use: 'Grammatical Range band 7+' },
  { key: 'concession', title: 'Concession and complex sentences', level: 'C1', mistakes: ['sentence structure', 'punctuation'], use: 'Writing Task 2' },
  { key: 'collocations', title: 'Academic collocations', level: 'C1', mistakes: ['collocation'], use: 'Lexical Resource' },
  { key: 'register', title: 'Formal register: avoiding informal words', level: 'C1', mistakes: ['formality/register'], use: 'Writing Task 2' },
  { key: 'punctuation', title: 'Punctuation in complex sentences', level: 'C1', mistakes: ['punctuation'], use: 'Writing' },
];

const START: Record<string, Level> = { beginner: 'B1', intermediate: 'B1', upper_intermediate: 'B2' };
const ORDER: Level[] = ['B1', 'B2', 'C1'];

export type Progress = { topic_key: string; best_score: number; last_at: string | null };

/**
 * Topik grammar hari ini.
 * 1. Topik yang terkait 3 kesalahan teratas dan belum dikuasai (skor terbaik < 4).
 * 2. Kalau tidak ada, topik berikutnya di kurikulum mulai dari level pengguna.
 * 3. Kalau semua dikuasai, ulang topik yang paling lama tidak dilatih.
 */
export function pickGrammarTopic(progress: Progress[], topMistakes: string[], level: string): GrammarTopic {
  const byKey = new Map(progress.map((p) => [p.topic_key, p]));
  const mastered = (t: GrammarTopic) => (byKey.get(t.key)?.best_score ?? 0) >= 4;
  const from = ORDER.indexOf(START[level] ?? 'B1');
  const pool = GRAMMAR_TOPICS.filter((t) => ORDER.indexOf(t.level) >= from);
  const top = topMistakes.map((m) => m.toLowerCase());
  for (const m of top) {
    const hit = pool.find((t) => !mastered(t) && t.mistakes.includes(m));
    if (hit) return hit;
  }
  const next = pool.find((t) => !mastered(t));
  if (next) return next;
  return [...pool].sort((a, b) => (byKey.get(a.key)?.last_at ?? '').localeCompare(byKey.get(b.key)?.last_at ?? ''))[0] ?? GRAMMAR_TOPICS[0];
}

export function topicByKey(key: string | null | undefined): GrammarTopic | undefined {
  return GRAMMAR_TOPICS.find((t) => t.key === key);
}

/* ---------------- skill harian ---------------- */

export type Skill = 'reading' | 'writing_task2' | 'listening' | 'speaking_part1' | 'speaking_part2' | 'writing_task1' | 'speaking_part3' | 'report';

export const SKILLS: Record<Skill, { title: string; detail: string; href: string; minutes: number }> = {
  reading: { title: 'Reading', detail: 'Teks akademik pendek dan 6 soal tipe IELTS', href: '/bahasa/ielts/reading', minutes: 8 },
  writing_task2: { title: 'Writing Task 2', detail: 'Esai minimal 250 kata, boleh dicicil', href: '/bahasa/ielts/writing?task=2', minutes: 15 },
  listening: { title: 'Listening', detail: 'Rekaman 2 sampai 3 menit dan 6 soal, lalu transkrip dan terjemahannya', href: '/bahasa/ielts/listening', minutes: 8 },
  speaking_part1: { title: 'Speaking Part 1', detail: 'Pertanyaan singkat tentang dirimu', href: '/bahasa/ielts/speaking?part=1', minutes: 5 },
  speaking_part2: { title: 'Speaking Part 2', detail: 'Cue card, bicara sampai 2 menit', href: '/bahasa/ielts/speaking?part=2', minutes: 5 },
  writing_task1: { title: 'Writing Task 1', detail: 'Ringkas data tabel, minimal 150 kata', href: '/bahasa/ielts/writing?task=1', minutes: 12 },
  speaking_part3: { title: 'Speaking Part 3', detail: 'Diskusi topik abstrak', href: '/bahasa/ielts/speaking?part=3', minutes: 5 },
  report: { title: 'Laporan mingguan', detail: 'Lihat perkiraan band dan rencana minggu depan', href: '/bahasa#laporan', minutes: 3 },
};

/** Senin Reading, Selasa Writing Task 2, Rabu Listening, Kamis Speaking Part 2, Jumat Writing Task 1, Sabtu Speaking Part 3, Minggu laporan (D-65). */
const ROTATION: Skill[] = ['reading', 'writing_task2', 'listening', 'speaking_part2', 'writing_task1', 'speaking_part3', 'report'];

export function skillFor(date: string): Skill {
  return ROTATION[isoWeekday(date) - 1];
}

/* ---------------- band ---------------- */

/** Pembulatan band IELTS: ke kelipatan 0,5 terdekat (6,25 menjadi 6,5 dan 6,75 menjadi 7). */
export function roundBand(x: number): number {
  return Math.min(9, Math.max(0, Math.round(x * 2) / 2));
}

export type WritingBands = { task: number; coherence: number; lexical: number; grammar: number };
export type SpeakingBands = { fluency: number; lexical: number; grammar: number; pronunciation: number };

export function bandOf(b: WritingBands | SpeakingBands): number {
  const v = Object.values(b);
  return roundBand(v.reduce((a, x) => a + x, 0) / v.length);
}

/** Perkiraan band Writing: Task 2 berbobot dua kali Task 1. Satu tugas saja dipakai apa adanya. */
export function writingBand(task1: number | null, task2: number | null): number | null {
  if (task1 != null && task2 != null) return roundBand((task1 + 2 * task2) / 3);
  return task2 ?? task1;
}

/** Rata-rata beberapa nilai terakhir supaya satu latihan buruk tidak menjatuhkan perkiraan. */
export function recentBand(values: number[], take = 3): number | null {
  const v = values.filter((x) => Number.isFinite(x)).slice(0, take);
  return v.length ? roundBand(v.reduce((a, x) => a + x, 0) / v.length) : null;
}

/** Perkiraan band dari jumlah jawaban benar latihan Reading pendek. Kasar, hanya untuk arah. */
export function readingBand(correct: number, total: number): number | null {
  if (!total) return null;
  // tabel konversi umum IELTS Academic Reading (40 soal: 39 = 9, 30 = 7, 23 = 6, 15 = 5) dijadikan persentase
  const pct = correct / total;
  const table: [number, number][] = [[0.975, 9], [0.925, 8.5], [0.875, 8], [0.825, 7.5], [0.75, 7], [0.675, 6.5], [0.575, 6], [0.475, 5.5], [0.375, 5], [0.325, 4.5], [0.25, 4]];
  for (const [min, band] of table) if (pct >= min) return band;
  return 3.5;
}

export function overallBand(skills: (number | null)[]): number | null {
  const v = skills.filter((x): x is number => x != null);
  return v.length ? roundBand(v.reduce((a, x) => a + x, 0) / v.length) : null;
}

export const SESSION_STEPS = ['review', 'words', 'grammar', 'skill'] as const;
export type SessionStep = (typeof SESSION_STEPS)[number];
