import { describe, expect, it } from 'vitest';
import { sentenceAround } from './text';
import type { AgentModel, ModelRequest } from '@/lib/agent/model';
import { correctWriting, englishModeFeedback, evaluateSpeaking, explainText, MISTAKE_TYPES, speakingQuestion, vocabEntry } from './ai';
import { streakDays } from './store';
import { addDays } from '@/lib/time';

const fake = (out: unknown) => {
  const reqs: ModelRequest[] = [];
  const model: AgentModel = { name: 'f', generate: async (r) => { reqs.push(r); const text = typeof out === 'string' ? out : JSON.stringify(out); return { content: { role: 'model', parts: [{ text }] }, functionCalls: [], text }; } };
  return { model, reqs };
};
const profile = { level: 'intermediate', goal: 'academic_general', correction: 'important_only', topMistakes: ['article a/an/the'] };

describe('Gemini bahasa', () => {
  it('koreksi tulisan: JSON terstruktur, jenis kesalahan baku, mode hanya yang penting', async () => {
    const { model, reqs } = fake({ corrected: 'The outcrop shows alteration.', mistakes: [{ original: 'outcrop show', fix: 'outcrop shows', type: 'subject-verb agreement', explanation_id: 'Subjek tunggal.' }], score: { grammar: 7, vocabulary: 8, clarity: 8 } });
    const r = await correctWriting(model, profile, { text: 'The outcrop show alteration.', kind: 'draf abstrak', onlyImportant: true });
    expect(r.mistakes[0].type).toBe('subject-verb agreement');
    expect(r.summary_id).toBe('');
    expect(reqs[0]).toMatchObject({ tools: [], thinking: 'low' });
    expect(reqs[0].system).toMatch(/hanya kesalahan penting/);
    expect(JSON.stringify(reqs[0].json)).toContain(MISTAKE_TYPES[0]);
  });
  it('jelaskan dan pecah kalimat', async () => {
    const { model, reqs } = fake({ translation_id: 'Singkapan itu...', explanation_id: 'Kalimat pasif.', parts: [{ text: 'The altered outcrop', translation_id: 'Singkapan teralterasi', grammar_id: 'subjek' }] });
    const r = await explainText(model, profile, { text: 'The altered outcrop shows strong argillic alteration.', breakdown: true });
    expect(r.parts).toHaveLength(1);
    expect(r.vocab).toEqual([]);
    expect(reqs[0].system).toMatch(/PECAH KALIMAT/);
  });
  it('entri kosakata dari konteks', async () => {
    const { model, reqs } = fake({ term: 'outcrop', meaning_id: 'singkapan batuan', example: 'The outcrop shows alteration.' });
    expect((await vocabEntry(model, profile, { term: 'outcrops', context: 'The outcrops show alteration.' })).term).toBe('outcrop');
    expect(reqs[0].contents[0].parts?.[0].text).toContain('Konteks');
  });
  it('pertanyaan bicara memancing pola kesalahan, penilaian membawa audio', async () => {
    const q = fake({ question: 'Describe your research.', hint_id: 'Ceritakan topik skripsimu.' });
    expect((await speakingQuestion(q.model, profile, { topic: 'Riset' })).question).toBe('Describe your research.');
    expect(q.reqs[0].system).toMatch(/article a\/an\/the/);
    const e = fake({ transcript: 'I am study geology', heard_speech: true, grammar: [], natural_version: 'I study geology.' });
    const fb = await evaluateSpeaking(e.model, profile, { question: 'Describe your research.', audio: { data: Buffer.from('RIFF'), mime: 'audio/wav' } });
    expect(fb.natural_version).toBe('I study geology.');
    expect(e.reqs[0].contents[0].parts?.[0].inlineData?.mimeType).toBe('audio/wav');
  });
  it('English Mode: koreksi singkat, bukan bahasa Inggris dilewati', async () => {
    const yes = fake({ is_english: true, corrected: 'How much money do I have?', notes: [{ original: 'how many money', fix: 'how much money', type: 'word choice', explanation_id: 'money tak terhitung.' }] });
    expect((await englishModeFeedback(yes.model, profile, { text: 'how many money i have' })).notes).toHaveLength(1);
    expect(yes.reqs[0].system).toMatch(/hanya kesalahan penting/);
    const no = fake({ is_english: false });
    expect((await englishModeFeedback(no.model, profile, { text: 'saldo berapa' })).is_english).toBe(false);
  });
});

describe('fungsi murni', () => {
  it('kalimat konteks di sekitar kata terpilih', () => {
    const t = 'First sentence here. The altered outcrop shows strong alteration. Last one.';
    const i = t.indexOf('outcrop');
    expect(sentenceAround(t, i, i + 7)).toBe('The altered outcrop shows strong alteration.');
  });
  it('streak hari berturut-turut, boleh mulai dari kemarin', () => {
    expect(streakDays(new Set(['2026-11-24', '2026-11-23', '2026-11-22', '2026-11-20']), '2026-11-24', addDays)).toBe(3);
    expect(streakDays(new Set(['2026-11-23', '2026-11-22']), '2026-11-24', addDays)).toBe(2);
    expect(streakDays(new Set(['2026-11-21']), '2026-11-24', addDays)).toBe(0);
  });
});
