// Suara untuk IELTS Listening (D-65) dengan model TTS Gemini (GEMINI_TTS_MODEL).
// Percakapan memakai dua suara (multi-speaker), ceramah memakai satu suara. Hasilnya PCM 16-bit mono.
import { GoogleGenAI, Modality } from '@google/genai';
import { geminiConfig } from '@/lib/agent/model';
import type { ListeningScript } from './ielts-ai';
import { rateFromMime } from './listening';

/** Suara bawaan Gemini TTS. Bisa diganti lewat env bila suara tertentu tidak tersedia. */
const VOICES = {
  female: process.env.GEMINI_TTS_VOICE_FEMALE?.trim() || 'Kore',
  male: process.env.GEMINI_TTS_VOICE_MALE?.trim() || 'Puck',
  lecturer: process.env.GEMINI_TTS_VOICE_LECTURER?.trim() || 'Charon',
};

export function ttsModel(): string | null {
  return process.env.GEMINI_TTS_MODEL?.trim() || null;
}

export type TtsScript = { speakers: ListeningScript['speakers']; lines: { speaker: string; text: string }[] };

export function ttsPrompt(s: TtsScript): string {
  const style = 'Read it like an IELTS Listening recording: clear British English, natural pace, short pauses between turns.';
  if (s.speakers.length === 1) return `${style}\n\n${s.lines.map((l) => l.text).join('\n')}`;
  const names = s.speakers.map((x) => x.name).join(' and ');
  return `${style}\nTTS the following conversation between ${names}:\n${s.lines.map((l) => `${l.speaker}: ${l.text}`).join('\n')}`;
}

export class TtsError extends Error {}

export async function synthesize(s: TtsScript, signal?: AbortSignal): Promise<{ pcm: Buffer; rate: number }> {
  const cfg = geminiConfig();
  const model = ttsModel();
  if (!cfg) throw new TtsError('Gemini belum diatur.');
  if (!model) throw new TtsError('GEMINI_TTS_MODEL belum diisi di Vercel (mis. gemini-3.8-flash-tts).');
  const ai = new GoogleGenAI({ apiKey: cfg.apiKey, httpOptions: { timeout: 55_000, ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}) } });
  const speechConfig = s.speakers.length === 1
    ? { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICES.lecturer } } }
    : { multiSpeakerVoiceConfig: { speakerVoiceConfigs: s.speakers.map((x) => ({ speaker: x.name, voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICES[x.gender] } } })) } };
  let res;
  try {
    res = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: ttsPrompt(s) }] }],
      config: { responseModalities: [Modality.AUDIO], speechConfig, abortSignal: signal },
    });
  } catch (e) {
    const status = (e as { status?: number }).status;
    throw new TtsError(status === 429 ? 'Kuota TTS Gemini habis. Coba lagi nanti.' : status && status >= 500 ? 'Server TTS Gemini sedang sibuk. Coba lagi sebentar.' : `TTS Gemini gagal: ${(e as Error).message.slice(0, 200)}`);
  }
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  const audio = parts.filter((p) => p.inlineData?.data && p.inlineData.mimeType?.startsWith('audio/'));
  if (!audio.length) throw new TtsError('Gemini tidak mengembalikan audio. Pastikan GEMINI_TTS_MODEL adalah model TTS.');
  const pcm = Buffer.concat(audio.map((p) => Buffer.from(p.inlineData!.data!, 'base64')));
  return { pcm, rate: rateFromMime(audio[0].inlineData!.mimeType) };
}
