// Diagnosa koneksi Gemini dari server (D-45): uji tiap model dengan pesan sederhana, dengan dan tanpa deklarasi tool.
import type { FunctionDeclaration } from '@google/genai';
import { GeminiModel, ModelError, type GeminiConfig } from './model';
import { functionDeclarations } from './tools';

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
  return {
    config: { model: cfg.model, fallback_model: cfg.fallbackModel ?? null, thinking_level: cfg.thinkingLevel ?? 'low', base_url_set: !!cfg.baseUrl, api_key_set: !!cfg.apiKey },
    cases,
  };
}
