// Pesan suara (SPEC 7.3, D-48): Gemini mendengar rekaman sekali untuk menuliskan ucapan pengguna,
// lalu transkripnya diproses loop agen seperti pesan teks. Audio tidak dikirim ulang di tiap langkah loop.
import { z } from 'zod';
import type { AgentModel } from './model';

export const TRANSCRIPT_SCHEMA = {
  type: 'object',
  properties: {
    transcript: { type: 'string', description: 'Ucapan pengguna apa adanya' },
    clear: { type: 'boolean', description: 'false bila tidak ada ucapan yang jelas' },
  },
  required: ['transcript', 'clear'],
} as const;

const TRANSCRIBE_PROMPT = [
  'Kamu menuliskan rekaman suara pendek dari pengguna app keuangan dan kuliah. Bahasanya Indonesia santai, bisa campur Inggris atau bahasa daerah.',
  'Tulis persis apa yang diucapkan, tanpa menjawab atau menjalankan permintaannya. Nominal boleh ditulis angka (mis. "30 ribu" atau "30rb").',
  'Bila rekaman sunyi, hanya bising, atau ucapannya tidak tertangkap, isi clear = false.',
].join('\n');

const parsed = z.object({ transcript: z.string(), clear: z.boolean().optional().default(true) });

/** Kembalikan transkrip, atau null bila tidak ada ucapan yang jelas. Galat model diteruskan (ModelError). */
export async function transcribeAudio(model: AgentModel, audio: { data: Buffer; mime: string }, signal?: AbortSignal): Promise<string | null> {
  const turn = await model.generate({
    system: TRANSCRIBE_PROMPT,
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: audio.mime, data: audio.data.toString('base64') } }, { text: 'Tuliskan isi rekaman ini.' }] }],
    tools: [], json: TRANSCRIPT_SCHEMA, thinking: 'minimal', signal,
  });
  let out: z.infer<typeof parsed>;
  try {
    out = parsed.parse(JSON.parse(turn.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')));
  } catch {
    // model menjawab teks biasa: pakai apa adanya
    out = { transcript: turn.text, clear: true };
  }
  const t = out.transcript.replace(/\s+/g, ' ').trim().slice(0, 1000);
  return out.clear && t ? t : null;
}
