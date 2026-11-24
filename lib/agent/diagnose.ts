// Diagnosa koneksi Gemini dari server (D-45): uji tiap model dengan pesan sederhana, dengan dan tanpa deklarasi tool.
import type { FunctionDeclaration } from '@google/genai';
import { GeminiModel, ModelError, type GeminiConfig } from './model';
import { functionDeclarations } from './tools';
import { transcribeAudio } from './voice';

export type DiagnoseCase = { model: string; test: string; ok: boolean; ms: number; reason?: string; detail?: string; reply?: string };
export type DiagnoseReport = {
  config: { model: string; fallback_model: string | null; thinking_level: string; base_url_set: boolean; api_key_set: boolean };
  cases: DiagnoseCase[];
};

export async function diagnose(cfg: GeminiConfig, timeoutMs = 25_000): Promise<DiagnoseReport> {
  const tools = functionDeclarations() as FunctionDeclaration[];
  const plans: { model: string; test: string; thinking: GeminiConfig['thinkingLevel']; withTools: boolean }[] = [];
  for (const model of [cfg.model, cfg.fallbackModel].filter((m): m is string => !!m)) {
    plans.push({ model, test: 'pesan singkat tanpa tool', thinking: cfg.thinkingLevel, withTools: false });
    plans.push({ model, test: `dengan ${tools.length} tool Ra`, thinking: cfg.thinkingLevel, withTools: true });
  }
  plans.push({ model: cfg.model, test: 'pesan singkat, thinkingLevel tidak dikirim', thinking: 'off', withTools: false });

  // paralel supaya selesai jauh di bawah batas fungsi Vercel
  const cases = await Promise.all(plans.map(async (p): Promise<DiagnoseCase> => {
    const m = new GeminiModel({ apiKey: cfg.apiKey, model: p.model, baseUrl: cfg.baseUrl, thinkingLevel: p.thinking });
    const t0 = Date.now();
    try {
      const turn = await m.generate({
        system: 'Jawab satu kata saja.', contents: [{ role: 'user', parts: [{ text: 'Balas dengan kata: siap' }] }],
        tools: p.withTools ? tools : [], signal: AbortSignal.timeout(timeoutMs),
      });
      return { model: p.model, test: p.test, ok: true, ms: Date.now() - t0, reply: (turn.text || turn.functionCalls.map((c) => `memanggil ${c.name}`).join(', ')).slice(0, 80) };
    } catch (e) {
      const me = e instanceof ModelError ? e : null;
      return { model: p.model, test: p.test, ok: false, ms: Date.now() - t0, reason: me?.reason ?? 'galat', detail: (me?.detail || (e as Error).message || String(e)).slice(0, 400) };
    }
  }));
  // transkripsi pesan suara (D-48, D-49): 1 detik nada 440 Hz, bukan ucapan. Mengukur waktu jawab dan
  // memeriksa model tidak mengarang transkrip dari audio tanpa ucapan.
  const tone = toneWav(1, 440);
  const t0 = Date.now();
  try {
    const t = await transcribeAudio(new GeminiModel({ apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl, thinkingLevel: cfg.thinkingLevel }), { data: tone, mime: 'audio/wav' }, AbortSignal.timeout(timeoutMs));
    // audio sunyi harus menghasilkan "tidak jelas". Ada transkrip = model mengarang (D-49).
    cases.push(t
      ? { model: cfg.model, test: 'transkripsi audio 1 detik (nada, bukan ucapan)', ok: false, ms: Date.now() - t0, reason: 'halusinasi', detail: `Model mengarang transkrip dari audio tanpa ucapan: "${t.slice(0, 120)}"` }
      : { model: cfg.model, test: 'transkripsi audio 1 detik (nada, bukan ucapan)', ok: true, ms: Date.now() - t0, reply: '(tidak jelas, sesuai harapan)' });
  } catch (e) {
    const me = e instanceof ModelError ? e : null;
    cases.push({ model: cfg.model, test: 'transkripsi audio 1 detik (nada, bukan ucapan)', ok: false, ms: Date.now() - t0, reason: me?.reason ?? 'galat', detail: (me?.detail || (e as Error).message || String(e)).slice(0, 400) });
  }
  return {
    config: { model: cfg.model, fallback_model: cfg.fallbackModel ?? null, thinking_level: cfg.thinkingLevel ?? 'low', base_url_set: !!cfg.baseUrl, api_key_set: !!cfg.apiKey },
    cases,
  };
}

/** WAV PCM 16-bit mono 16 kHz berisi nada sinus. */
export function toneWav(seconds: number, hz: number): Buffer {
  const rate = 16000;
  const n = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 8000), 44 + i * 2);
  return b;
}
