// IELTS Listening (D-65): pencocokan jawaban isian, konversi band, dan pembungkus WAV. Fungsi murni.

/** Rapikan jawaban isian: huruf kecil, tanpa tanda baca di tepi, spasi tunggal, artikel di depan diabaikan. */
export function normalizeAnswer(s: string): string {
  return s.toLowerCase().normalize('NFKC')
    .replace(/[“”"'’`]/g, '')
    .replace(/[.,;:!?()]+/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^(a|an|the) /, '');
}

/** Jawaban isian benar bila sama dengan kunci atau salah satu variasi yang diterima (mis. "15" dan "fifteen"). */
export function gapCorrect(input: string, answer: string, accept: string[] = []): boolean {
  const got = normalizeAnswer(input);
  if (!got) return false;
  return [answer, ...accept].some((a) => normalizeAnswer(a) === got);
}

/**
 * Perkiraan band dari persentase benar, mengikuti tabel konversi umum IELTS Listening 40 soal
 * (39 = 9, 35 = 8, 30 = 7, 23 = 6, 16 = 5, 10 = 4). Latihan pendek, jadi hasilnya kasar.
 */
export function listeningBand(correct: number, total: number): number | null {
  if (!total) return null;
  const pct = correct / total;
  const table: [number, number][] = [[0.975, 9], [0.925, 8.5], [0.875, 8], [0.8, 7.5], [0.75, 7], [0.65, 6.5], [0.575, 6], [0.45, 5.5], [0.4, 5], [0.325, 4.5], [0.25, 4]];
  for (const [min, band] of table) if (pct >= min) return band;
  return 3.5;
}

/** Bungkus PCM 16-bit mono menjadi berkas WAV supaya bisa diputar browser. */
export function pcmToWav(pcm: Buffer, rate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Laju sampel dari mimeType TTS Gemini, mis. "audio/L16;codec=pcm;rate=24000". */
export function rateFromMime(mime: string | undefined, fallback = 24_000): number {
  const m = mime?.match(/rate=(\d+)/);
  return m ? Number(m[1]) : fallback;
}
