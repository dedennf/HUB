// Utilitas teks untuk membaca berpendamping (fungsi murni).

/** Kalimat yang memuat potongan terpilih, sebagai konteks untuk Gemini dan contoh kalimat kosakata. */
export function sentenceAround(text: string, start: number, end: number): string {
  const before = text.slice(0, start);
  const s = Math.max(before.lastIndexOf('. '), before.lastIndexOf('? '), before.lastIndexOf('! '), before.lastIndexOf('\n')) + 1;
  const rest = text.slice(end);
  const m = rest.search(/[.?!](\s|$)|\n/);
  return text.slice(s, m === -1 ? text.length : end + m + 1).trim();
}
