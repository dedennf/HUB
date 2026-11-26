import { describe, expect, it } from 'vitest';
import { lessonSchema, readingSchema } from './ielts-ai';
import { bandOf, GRAMMAR_TOPICS, overallBand, pickGrammarTopic, readingBand, recentBand, roundBand, skillFor, writingBand } from './ielts';
import { MISTAKE_TYPES } from './ai';

describe('band IELTS', () => {
  it('membulatkan ke 0,5 terdekat seperti IELTS', () => {
    expect(roundBand(6.25)).toBe(6.5);
    expect(roundBand(6.75)).toBe(7);
    expect(roundBand(6.1)).toBe(6);
    expect(roundBand(9.4)).toBe(9);
  });
  it('band tugas = rata-rata empat kriteria', () => {
    expect(bandOf({ task: 6, coherence: 6.5, lexical: 6, grammar: 5.5 })).toBe(6);
    expect(bandOf({ fluency: 7, lexical: 6.5, grammar: 6.5, pronunciation: 7 })).toBe(7);
  });
  it('Task 2 berbobot dua kali Task 1', () => {
    expect(writingBand(5, 7)).toBe(6.5);
    expect(writingBand(null, 6)).toBe(6);
    expect(writingBand(5.5, null)).toBe(5.5);
    expect(writingBand(null, null)).toBeNull();
  });
  it('perkiraan dari 3 nilai terakhir dan overall dari skill yang ada', () => {
    expect(recentBand([7, 6, 5, 4])).toBe(6);
    expect(recentBand([])).toBeNull();
    expect(overallBand([6, null, 7])).toBe(6.5);
    expect(overallBand([null, null])).toBeNull();
  });
  it('konversi Reading mengikuti tabel 40 soal', () => {
    expect(readingBand(6, 6)).toBe(9);
    expect(readingBand(5, 6)).toBe(7.5);
    expect(readingBand(4, 6)).toBe(6);
    expect(readingBand(3, 6)).toBe(5.5);
    expect(readingBand(0, 6)).toBe(3.5);
    expect(readingBand(0, 0)).toBeNull();
  });
});

describe('kurikulum grammar', () => {
  it('semua kunci unik dan jenis kesalahan memakai daftar baku', () => {
    expect(new Set(GRAMMAR_TOPICS.map((t) => t.key)).size).toBe(GRAMMAR_TOPICS.length);
    for (const t of GRAMMAR_TOPICS) for (const m of t.mistakes) expect(MISTAKE_TYPES).toContain(m);
  });
  it('mendahulukan topik yang terkait kesalahan teratas', () => {
    expect(pickGrammarTopic([], ['collocation'], 'intermediate').key).toBe('quantifiers');
    expect(pickGrammarTopic([], ['article a/an/the'], 'intermediate').key).toBe('articles');
  });
  it('melewati topik yang sudah dikuasai', () => {
    const p = [{ topic_key: 'articles', best_score: 5, last_at: '2026-11-01' }];
    expect(pickGrammarTopic(p, ['article a/an/the'], 'intermediate').key).toBe('sva');
  });
  it('level menengah atas mulai dari B2', () => {
    expect(pickGrammarTopic([], [], 'upper_intermediate').level).toBe('B2');
  });
  it('semua dikuasai: ulang yang paling lama tidak dilatih', () => {
    const p = GRAMMAR_TOPICS.map((t, i) => ({ topic_key: t.key, best_score: 5, last_at: `2026-10-${String(10 + (i % 20)).padStart(2, '0')}` }));
    p[3].last_at = '2026-01-01';
    expect(pickGrammarTopic(p, [], 'intermediate').key).toBe(GRAMMAR_TOPICS[3].key);
  });
});

describe('rotasi skill', () => {
  it('Senin Reading sampai Minggu laporan', () => {
    expect(skillFor('2026-11-23')).toBe('reading');
    expect(skillFor('2026-11-24')).toBe('writing_task2');
    expect(skillFor('2026-11-25')).toBe('listening');
    expect(skillFor('2026-11-27')).toBe('writing_task1');
    expect(skillFor('2026-11-29')).toBe('report');
  });
});

describe('validasi konten Gemini', () => {
  const ex = (answer: string) => ({ prompt: 'If I ____ time, I would go.', options: ['have', 'had', 'will have'], answer, explanation_id: 'x' });
  it('menolak soal yang jawabannya tidak ada di pilihan', () => {
    const base = { explanation_id: 'x', examples: [{ en: 'a' }] };
    expect(lessonSchema.safeParse({ ...base, exercises: [ex('had'), ex('had'), ex('had')] }).success).toBe(true);
    expect(lessonSchema.safeParse({ ...base, exercises: [ex('had'), ex('has'), ex('had')] }).success).toBe(false);
  });
  it('reading butuh teks cukup panjang', () => {
    const q = { type: 'tfng', prompt: 'p', options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: 'TRUE', explanation_id: 'x' };
    expect(readingSchema.safeParse({ title: 't', passage: 'short', questions: [q, q, q, q] }).success).toBe(false);
    expect(readingSchema.safeParse({ title: 't', passage: 'x'.repeat(300), questions: [q, q, q, q] }).success).toBe(true);
  });
});
