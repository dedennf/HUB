import { describe, expect, it } from 'vitest';
import { listeningSchema } from './ielts-ai';
import { gapCorrect, listeningBand, normalizeAnswer, pcmToWav, rateFromMime } from './listening';
import { ttsParts, ttsPrompt } from './tts';

describe('jawaban isian Listening', () => {
  it('abaikan huruf besar, tanda baca, spasi, dan artikel di depan', () => {
    expect(normalizeAnswer('  The Library. ')).toBe('library');
    expect(gapCorrect('library', 'the library')).toBe(true);
    expect(gapCorrect('Tuesday', 'Tuesday')).toBe(true);
    expect(gapCorrect('fifteen', '15', ['fifteen'])).toBe(true);
    expect(gapCorrect('16', '15', ['fifteen'])).toBe(false);
    expect(gapCorrect('', 'x')).toBe(false);
  });
});

describe('band Listening', () => {
  it('mengikuti tabel 40 soal', () => {
    expect(listeningBand(6, 6)).toBe(9);
    expect(listeningBand(5, 6)).toBe(7.5);
    expect(listeningBand(4, 6)).toBe(6.5);
    expect(listeningBand(3, 6)).toBe(5.5);
    expect(listeningBand(0, 6)).toBe(3.5);
    expect(listeningBand(0, 0)).toBeNull();
  });
});

describe('audio', () => {
  it('WAV dari PCM dan laju dari mimeType', () => {
    const w = pcmToWav(Buffer.alloc(48000), 24000);
    expect(w.length).toBe(48044);
    expect(w.toString('ascii', 0, 4)).toBe('RIFF');
    expect(w.readUInt32LE(24)).toBe(24000);
    expect(rateFromMime('audio/L16;codec=pcm;rate=24000')).toBe(24000);
    expect(rateFromMime(undefined)).toBe(24000);
  });
  it('prompt TTS: percakapan memakai nama pembicara, ceramah tidak', () => {
    const two = ttsPrompt({ speakers: [{ name: 'Anna', gender: 'female' }, { name: 'Tom', gender: 'male' }], lines: [{ speaker: 'Anna', text: 'Hi.' }, { speaker: 'Tom', text: 'Hello.' }] });
    expect(two).toContain('between Anna and Tom');
    expect(two).toContain('Tom: Hello.');
    const one = ttsPrompt({ speakers: [{ name: 'Dr Lee', gender: 'male' }], lines: [{ speaker: 'Dr Lee', text: 'Today we discuss bees.' }] });
    expect(one).not.toContain('Dr Lee:');
  });
  it('percakapan: tiap kalimat satu part dengan speechMetadata.speaker', () => {
    const s = { speakers: [{ name: 'Anna', gender: 'female' as const }, { name: 'Tom', gender: 'male' as const }], lines: [{ speaker: 'Anna', text: 'Hi.' }, { speaker: 'Tom', text: 'Hello.' }] };
    const parts = ttsParts(s);
    expect(parts).toHaveLength(2);
    expect(parts.map((p) => p.speechMetadata?.speaker)).toEqual(['Anna', 'Tom']);
    expect(parts[1].text).toBe('Hello.');
    expect(ttsParts(s, true)).toEqual([{ text: ttsPrompt(s) }]);
    expect(ttsParts({ speakers: [s.speakers[0]], lines: [s.lines[0]] })).toHaveLength(1);
  });
});

describe('validasi naskah Gemini', () => {
  const base = {
    title: 't', speakers: [{ name: 'Anna', gender: 'female' }, { name: 'Tom', gender: 'male' }],
    lines: Array.from({ length: 4 }, (_, i) => ({ speaker: i % 2 ? 'Tom' : 'Anna', text: 'x', translation_id: 'y' })),
  };
  const q = (type: 'gap' | 'mcq', answer: string, options: string[] = []) => ({ type, prompt: 'p', options, answer, explanation_id: 'e' });
  it('menerima naskah yang konsisten', () => {
    expect(listeningSchema.safeParse({ ...base, questions: [q('gap', '15'), q('gap', 'May'), q('mcq', 'A', ['A', 'B']), q('mcq', 'B', ['A', 'B'])] }).success).toBe(true);
  });
  it('menolak jawaban pilihan ganda di luar pilihan dan pembicara asing', () => {
    expect(listeningSchema.safeParse({ ...base, questions: [q('gap', '1'), q('gap', '2'), q('mcq', 'C', ['A', 'B']), q('gap', '3')] }).success).toBe(false);
    expect(listeningSchema.safeParse({ ...base, lines: [...base.lines, { speaker: 'Bob', text: 'x', translation_id: 'y' }], questions: [q('gap', '1'), q('gap', '2'), q('gap', '3'), q('gap', '4')] }).success).toBe(false);
  });
});
