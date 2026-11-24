// Antarmuka model untuk loop agen. Implementasi nyata memakai Gemini (@google/genai), uji memakai model tiruan.
import { ApiError, GoogleGenAI, type Content, type FunctionDeclaration } from '@google/genai';

export type { Content };
export type FunctionCallOut = { id?: string; name: string; args: Record<string, unknown> };
export type ModelTurn = { content: Content; functionCalls: FunctionCallOut[]; text: string };
export type ModelRequest = { system: string; contents: Content[]; tools: FunctionDeclaration[]; signal?: AbortSignal };

export interface AgentModel {
  readonly name: string;
  generate(req: ModelRequest): Promise<ModelTurn>;
}

/** Galat model yang ramah ditampilkan (SPEC 12: kuota habis, timeout). */
export class ModelError extends Error {
  /** `detail`: galat asli (nama, status, pesan) untuk log server. Tidak berisi API key. */
  constructor(public readonly reason: 'not_configured' | 'quota' | 'timeout' | 'rejected' | 'unavailable', message: string, public readonly detail = '') {
    super(message);
  }
}

export function geminiConfig(): { apiKey: string; model: string; baseUrl?: string } | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim();
  if (!apiKey || !model) return null;
  // GEMINI_BASE_URL hanya untuk uji lokal dengan server tiruan. Jangan diisi di production.
  return { apiKey, model, baseUrl: process.env.GEMINI_BASE_URL?.trim() || undefined };
}

export class GeminiModel implements AgentModel {
  private ai: GoogleGenAI;
  readonly name: string;

  constructor(cfg: { apiKey: string; model: string; baseUrl?: string }) {
    this.ai = new GoogleGenAI({ apiKey: cfg.apiKey, httpOptions: { timeout: 20_000, ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}) } });
    this.name = cfg.model;
  }

  async generate(req: ModelRequest): Promise<ModelTurn> {
    try {
      return await this.once(req);
    } catch (e) {
      // 5xx dari Gemini (mis. model sedang penuh) biasanya sementara: coba sekali lagi
      if (!(e instanceof ModelError) || e.reason !== 'unavailable' || !/^\S+ 5\d\d /.test(e.detail) || req.signal?.aborted) throw e;
      await new Promise((r) => setTimeout(r, 800));
      return this.once(req);
    }
  }

  private async once(req: ModelRequest): Promise<ModelTurn> {
    try {
      const res = await this.ai.models.generateContent({
        model: this.name,
        contents: req.contents,
        config: {
          systemInstruction: req.system,
          tools: [{ functionDeclarations: req.tools }],
          temperature: 0.2,
          abortSignal: req.signal,
          automaticFunctionCalling: { disable: true },
        },
      });
      // Konten model dikembalikan utuh (termasuk thoughtSignature) agar riwayat sah untuk giliran berikutnya.
      const content: Content = res.candidates?.[0]?.content ?? { role: 'model', parts: [] };
      const parts = content.parts ?? [];
      const functionCalls = parts.filter((p) => p.functionCall?.name).map((p) => ({ id: p.functionCall!.id, name: p.functionCall!.name!, args: p.functionCall!.args ?? {} }));
      const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
      return { content: { role: 'model', parts }, functionCalls, text };
    } catch (e) {
      const err = e as Error & { status?: number; cause?: { code?: string; message?: string } };
      // nama, status, pesan asli, dan penyebab jaringan (mis. ENOTFOUND) supaya log Vercel bisa dibaca
      const detail = [err.name, err.status ?? '-', (err.message ?? String(e)).slice(0, 300), err.cause ? `cause=${err.cause.code ?? ''} ${err.cause.message ?? ''}` : ''].join(' ').trim();
      // cek status juga tanpa instanceof, supaya tetap jalan bila bundler memuat dua salinan kelas ApiError
      const status = e instanceof ApiError || err.name === 'ApiError' ? err.status : undefined;
      if (status === 429) throw new ModelError('quota', 'Kuota Gemini sedang habis.', detail);
      if (status === 400 || status === 403 || status === 404) throw new ModelError('rejected', `Gemini menolak permintaan (${status}). Periksa GEMINI_API_KEY dan GEMINI_MODEL.`, detail);
      if (status) throw new ModelError('unavailable', `Gemini bermasalah (${status}).`, detail);
      if (err.name === 'AbortError' || /timeout|timed out/i.test(err.message ?? '')) throw new ModelError('timeout', 'Gemini tidak menjawab tepat waktu.', detail);
      throw new ModelError('unavailable', 'Tidak bisa terhubung ke Gemini.', detail);
    }
  }
}

export function defaultModel(): AgentModel | null {
  const cfg = geminiConfig();
  return cfg ? new GeminiModel(cfg) : null;
}
