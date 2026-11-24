// Konfigurasi sesi Gemini Live (SPEC 7.3 tingkat 2, Fase 8). Disusun server lalu dikunci di token sementara,
// sehingga klien tidak bisa mengubah instruksi sistem, tools, atau model.
import type { SupabaseClient } from '@supabase/supabase-js';
import { Modality, type FunctionDeclaration, type LiveConnectConfig } from '@google/genai';
import { buildSnapshot, buildSystemPrompt, formatMemory, loadContextData, loadMemory, selectMemory } from '@/lib/agent/context-builder';
import { functionDeclarations } from '@/lib/agent/tools';
import type { EnglishProfile } from '@/lib/english/ai';

export type LiveMode = 'assistant' | 'english';

export function liveModel(): string | null {
  return process.env.GEMINI_LIVE_MODEL?.trim() || null;
}

const VOICE_RULES = [
  'PERCAKAPAN SUARA LANGSUNG: kamu sedang mengobrol lewat suara dengan pengguna.',
  '- Jawab singkat dan natural, satu sampai dua kalimat, bahasa Indonesia santai. Jangan membacakan daftar panjang, sebut yang paling penting saja.',
  '- Tool tulis tidak langsung dijalankan: hasilnya kartu konfirmasi di layar pengguna. Katakan "cek kartunya di layar ya", jangan bilang sudah tersimpan.',
  '- Angka uang ucapkan wajar, mis. "tiga puluh ribu", bukan "Rp30.000".',
  '- Bila tidak jelas apa yang diminta, tanyakan balik dengan singkat.',
].join('\n');

const LEVEL: Record<string, string> = { beginner: 'beginner (A2)', intermediate: 'intermediate (B1-B2)', upper_intermediate: 'upper-intermediate (B2-C1)' };

export function englishSystem(p: EnglishProfile, topic?: string): string {
  return [
    'You are Ra, a friendly English conversation partner for an Indonesian university student.',
    `Student level: ${LEVEL[p.level] ?? p.level}. Goal: ${p.goal.replace('_', ' ')}.`,
    topic ? `Conversation topic: ${topic}.` : 'Topic: university life, research, presentations, or job interviews. Let the student choose.',
    'Speak English only, slowly and clearly, with short turns (1 to 3 sentences). Ask one follow-up question each turn to keep the student talking.',
    p.correction === 'off'
      ? 'Do not correct mistakes, just keep the conversation going.'
      : `When the student makes a ${p.correction === 'all' ? '' : 'clear '}mistake, briefly recast the correct form naturally in your reply (e.g. "Oh, you studied geology? ..."), without lecturing.`,
    p.topMistakes.length ? `The student often struggles with: ${p.topMistakes.join(', ')}. Create chances to practice these.` : '',
    'If the student speaks Indonesian, gently invite them to try in English.',
  ].filter(Boolean).join('\n');
}

/** Konfigurasi yang dikunci di token: modalitas audio, transkrip dua arah, instruksi, dan (asisten) tools. */
export async function liveConfig(db: SupabaseClient, mode: LiveMode, now: Date, today: string, english?: { profile: EnglishProfile; topic?: string }): Promise<LiveConnectConfig> {
  const base: LiveConnectConfig = {
    responseModalities: [Modality.AUDIO],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
  if (mode === 'english' && english) return { ...base, systemInstruction: englishSystem(english.profile, english.topic) };
  const [data, memory] = await Promise.all([loadContextData(db, now, today), loadMemory(db)]);
  const names = new Map<string, string>([...data.accounts.map((a) => [a.id, a.name] as const), ...data.categories.map((c) => [c.id, c.name] as const), ...data.courses.map((c) => [c.id, c.name] as const)]);
  const system = [buildSystemPrompt(data), buildSnapshot(data), formatMemory(selectMemory(memory, ''), names), VOICE_RULES].filter(Boolean).join('\n\n');
  return { ...base, systemInstruction: system, tools: [{ functionDeclarations: functionDeclarations() as FunctionDeclaration[] }] };
}
