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
  // transkripsi pesan suara (D-48): satu detik audio sunyi, mengukur waktu jawab saja
  const silent = Buffer.alloc(44 + 32000);
  silent.write('RIFF', 0); silent.writeUInt32LE(36 + 32000, 4); silent.write('WAVE', 8); silent.write('fmt ', 12);
  silent.writeUInt32LE(16, 16); silent.writeUInt16LE(1, 20); silent.writeUInt16LE(1, 22); silent.writeUInt32LE(16000, 24);
  silent.writeUInt32LE(32000, 28); silent.writeUInt16LE(2, 32); silent.writeUInt16LE(16, 34); silent.write('data', 36); silent.writeUInt32LE(32000, 40);
  const t0 = Date.now();
  try {
    const t = await transcribeAudio(new GeminiModel({ apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl, thinkingLevel: cfg.thinkingLevel }), { data: silent, mime: 'audio/wav' }, AbortSignal.timeout(timeoutMs));
    cases.push({ model: cfg.model, test: 'transkripsi audio 1 detik (sunyi)', ok: true, ms: Date.now() - t0, reply: t ?? '(tidak jelas, sesuai harapan)' });
  } catch (e) {
    const me = e instanceof ModelError ? e : null;
    cases.push({ model: cfg.model, test: 'transkripsi audio 1 detik (sunyi)', ok: false, ms: Date.now() - t0, reason: me?.reason ?? 'galat', detail: (me?.detail || (e as Error).message || String(e)).slice(0, 400) });
  }
  return {
    config: { model: cfg.model, fallback_model: cfg.fallbackModel ?? null, thinking_level: cfg.thinkingLevel ?? 'low', base_url_set: !!cfg.baseUrl, api_key_set: !!cfg.apiKey },
    cases,
  };
}
