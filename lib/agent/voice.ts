// Pesan suara (SPEC 7.3, D-48): Gemini mendengar rekaman sekali untuk menuliskan ucapan pengguna,
// lalu transkripnya diproses loop agen seperti pesan teks. Audio tidak dikirim ulang di tiap langkah loop.
import { z } from 'zod';
import { transcribeWithLive, wavToPcm16k } from '@/lib/live/transcribe';
import { geminiConfig, type AgentModel } from './model';

export const TRANSCRIPT_SCHEMA = {
  type: 'object',
  properties: {
    transcript: { type: 'string', description: 'Ucapan pengguna apa adanya' },
    clear: { type: 'boolean', description: 'false bila tidak ada ucapan yang jelas' },
  },
  required: ['transcript', 'clear'],
} as const;

const TRANSCRIBE_PROMPT = [
  'Tugasmu hanya menuliskan ucapan manusia yang benar-benar terdengar di rekaman. Bahasanya bisa Indonesia, Inggris, atau campuran.',
  'Jangan menjawab, jangan menjalankan permintaan, dan JANGAN mengarang kalimat yang tidak terdengar.',
  'Bila tidak ada ucapan manusia (sunyi, bising, musik, atau suara tidak jelas), isi transcript dengan string kosong dan clear = false.',
  'Tulis angka seperti yang diucapkan.',
].join('\n');

/** Puncak RMS per jendela 100 ms dari WAV PCM 16-bit. null bila bukan WAV PCM 16-bit (tidak bisa dinilai). */
export function wavPeakRms(buf: Buffer): number | null {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  if (buf.readUInt16LE(20) !== 1 || buf.readUInt16LE(34) !== 16) return null;
  const rate = buf.readUInt32LE(24) || 16000;
  const channels = buf.readUInt16LE(22) || 1;
  const win = Math.max(1, Math.round(rate / 10)) * channels;
  let peak = 0;
  for (let start = 44; start + 1 < buf.length; start += win * 2) {
    let sum = 0; let n = 0;
    for (let i = start; i + 1 < Math.min(buf.length, start + win * 2); i += 2) { const x = buf.readInt16LE(i) / 32768; sum += x * x; n++; }
    if (n) peak = Math.max(peak, Math.sqrt(sum / n));
  }
  return peak;
}
/** Di bawah ini rekaman dianggap sunyi dan tidak dikirim ke Gemini (D-49). */
export const SERVER_SILENCE_RMS = 0.01;

const parsed = z.object({ transcript: z.string(), clear: z.boolean().optional().default(true) });

/** Kembalikan transkrip, atau null bila tidak ada ucapan yang jelas. Galat model diteruskan (ModelError). */
export async function transcribeAudio(model: AgentModel, audio: { data: Buffer; mime: string }, signal?: AbortSignal): Promise<string | null> {
  // rekaman sunyi tidak dikirim: model cenderung mengarang isi dari keheningan
  const peak = audio.mime === 'audio/wav' ? wavPeakRms(audio.data) : null;
  if (peak !== null && peak < SERVER_SILENCE_RMS) return null;
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

/**
 * D-63: pesan suara ditranskripsi model Gemini Live (pengenal suara bawaan) bila GEMINI_LIVE_MODEL diisi
 * dan rekamannya WAV 16 kHz. Bila Live gagal atau tidak tersedia, kembali ke transkripsi model teks.
 */
export async function transcribeVoice(model: AgentModel, audio: { data: Buffer; mime: string }, signal?: AbortSignal): Promise<string | null> {
  const peak = audio.mime === 'audio/wav' ? wavPeakRms(audio.data) : null;
  if (peak !== null && peak < SERVER_SILENCE_RMS) return null;
  const live = process.env.GEMINI_LIVE_MODEL?.trim();
  const cfg = geminiConfig();
  const pcm = audio.mime === 'audio/wav' ? wavToPcm16k(audio.data) : null;
  if (live && cfg && pcm) {
    const t0 = Date.now();
    try {
      const t = await transcribeWithLive({ apiKey: cfg.apiKey, model: live, pcm, baseUrl: cfg.baseUrl, timeoutMs: 20_000 });
      console.log(`[voice] transkripsi Live ${Date.now() - t0} ms`);
      return t;
    } catch (e) {
      console.error('[voice] transkripsi Live gagal, pakai model teks:', (e as Error).message);
    }
  }
  return transcribeAudio(model, audio, signal);
}
