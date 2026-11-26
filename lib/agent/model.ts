// Antarmuka model untuk loop agen. Implementasi nyata memakai Gemini (@google/genai), uji memakai model tiruan.
import { overDailyBudget, reportUsage, usageFrom } from '@/lib/ai-usage';
import { ApiError, GoogleGenAI, ThinkingLevel as GenaiThinkingLevel, type Content, type FunctionDeclaration } from '@google/genai';

export type { Content };
export type FunctionCallOut = { id?: string; name: string; args: Record<string, unknown> };
export type ModelTurn = { content: Content; functionCalls: FunctionCallOut[]; text: string };
/** `json`: JSON Schema untuk output terstruktur (mis. ekstraksi struk). Bila diisi, jawaban model berupa teks JSON. */
export type ModelRequest = {
  system: string; contents: Content[]; tools: FunctionDeclaration[]; signal?: AbortSignal; json?: unknown;
  /** Ganti tingkat berpikir untuk permintaan ini saja (mis. transkripsi: minimal). */
  thinking?: ThinkingLevel;
};

export interface AgentModel {
  readonly name: string;
  generate(req: ModelRequest): Promise<ModelTurn>;
}

/** Galat model yang ramah ditampilkan (SPEC 12: kuota habis, timeout). */
export class ModelError extends Error {
  /** `detail`: galat asli (nama, status, pesan) untuk log server. Tidak berisi API key. */
  constructor(public readonly reason: 'not_configured' | 'quota' | 'budget' | 'timeout' | 'rejected' | 'unavailable', message: string, public readonly detail = '') {
    super(message);
  }
}

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high' | 'off';
export type GeminiConfig = { apiKey: string; model: string; fallbackModel?: string; baseUrl?: string; thinkingLevel?: ThinkingLevel };

/** Tingkat berpikir bawaan "low": Ra butuh jawaban cepat untuk perintah pendek (D-43). */
export function readThinkingLevel(raw: string | undefined): ThinkingLevel {
  const v = raw?.trim().toLowerCase();
  return v === 'minimal' || v === 'low' || v === 'medium' || v === 'high' || v === 'off' ? v : 'low';
}

export function geminiConfig(): GeminiConfig | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim();
  if (!apiKey || !model) return null;
  // GEMINI_BASE_URL hanya untuk uji lokal dengan server tiruan. Jangan diisi di production.
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL?.trim();
  return {
    apiKey, model, fallbackModel: fallbackModel && fallbackModel !== model ? fallbackModel : undefined,
    baseUrl: process.env.GEMINI_BASE_URL?.trim() || undefined, thinkingLevel: readThinkingLevel(process.env.GEMINI_THINKING_LEVEL),
  };
}

/** Model yang menolak thinkingLevel (mis. generasi lama). Diingat selama proses server hidup. */
const noThinkingLevel = new Set<string>();

export class GeminiModel implements AgentModel {
  private ai: GoogleGenAI;
  readonly name: string;
  private fallbackModel?: string;
  private thinkingLevel: ThinkingLevel;
  /** Model yang benar-benar menjawab giliran terakhir (utama atau cadangan), untuk log dan uji. */
  lastServedBy: string | null = null;

  constructor(cfg: GeminiConfig) {
    // timeout juga dikirim ke Google sebagai X-Server-Timeout: lewat dari ini Google membalas 504 DEADLINE_EXCEEDED
    this.ai = new GoogleGenAI({ apiKey: cfg.apiKey, httpOptions: { timeout: 25_000, ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}) } });
    this.name = cfg.model;
    this.fallbackModel = cfg.fallbackModel;
    this.thinkingLevel = cfg.thinkingLevel ?? 'low';
  }

  async generate(req: ModelRequest): Promise<ModelTurn> {
    try {
      return await this.attempt(req, this.name, !this.fallbackModel);
    } catch (e) {
      // model utama penuh (5xx), terlalu lama, atau kuotanya habis: pindah ke model cadangan bila ada (D-44)
      if (!this.fallbackModel || !(e instanceof ModelError) || req.signal?.aborted || !['unavailable', 'timeout', 'quota'].includes(e.reason)) throw e;
      console.warn(`[agent] ${this.name} gagal (${e.reason}), pindah ke model cadangan ${this.fallbackModel}`);
      return this.attempt(req, this.fallbackModel, true);
    }
  }

  /** Satu model: kirim ulang tanpa thinkingLevel bila ditolak, dan (bila diizinkan) coba ulang sekali saat 500/502/503. */
  private async attempt(req: ModelRequest, model: string, retry5xx: boolean): Promise<ModelTurn> {
    try {
      return await this.once(req, model);
    } catch (e) {
      if (!(e instanceof ModelError) || req.signal?.aborted) throw e;
      if (e.reason === 'rejected' && this.usesThinkingLevel(model) && /^\S+ 400 /.test(e.detail) && /thinking/i.test(e.detail)) {
        noThinkingLevel.add(model);
        return this.once(req, model);
      }
      // 504 berarti batas waktu habis, mengulang hanya membuang waktu
      if (retry5xx && e.reason === 'unavailable' && /^\S+ 50[023] /.test(e.detail)) {
        await new Promise((r) => setTimeout(r, 800));
        return this.once(req, model);
      }
      throw e;
    }
  }

  private usesThinkingLevel(model: string): boolean {
    return this.thinkingLevel !== 'off' && !noThinkingLevel.has(model);
  }

  private async once(req: ModelRequest, model: string): Promise<ModelTurn> {
    // batas token harian yang diatur pemilik (ROADMAP Fase 9): berhenti sebelum memanggil Gemini
    if (overDailyBudget()) throw new ModelError('budget', 'Batas pemakaian Gemini hari ini sudah tercapai.', 'daily token limit');
    try {
      const res = await this.ai.models.generateContent({
        model,
        contents: req.contents,
        config: {
          systemInstruction: req.system,
          ...(req.tools.length ? { tools: [{ functionDeclarations: req.tools }] } : {}),
          ...(req.json ? { responseMimeType: 'application/json', responseJsonSchema: req.json } : {}),
          temperature: req.json ? 0 : 0.2,
          abortSignal: req.signal,
          automaticFunctionCalling: { disable: true },
          ...(this.usesThinkingLevel(model) && (req.thinking ?? this.thinkingLevel) !== 'off'
            ? { thinkingConfig: { thinkingLevel: (req.thinking ?? this.thinkingLevel).toUpperCase() as GenaiThinkingLevel } } : {}),
        },
      });
      // Konten model dikembalikan utuh (termasuk thoughtSignature) agar riwayat sah untuk giliran berikutnya.
      const content: Content = res.candidates?.[0]?.content ?? { role: 'model', parts: [] };
      const parts = content.parts ?? [];
      const functionCalls = parts.filter((p) => p.functionCall?.name).map((p) => ({ id: p.functionCall!.id, name: p.functionCall!.name!, args: p.functionCall!.args ?? {} }));
      const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
      this.lastServedBy = model;
      reportUsage(usageFrom(model, res.usageMetadata));
      return { content: { role: 'model', parts }, functionCalls, text };
    } catch (e) {
      const err = e as Error & { status?: number; cause?: { code?: string; message?: string } };
      // nama, status, pesan asli, dan penyebab jaringan (mis. ENOTFOUND) supaya log Vercel bisa dibaca
      const detail = [err.name, err.status ?? '-', (err.message ?? String(e)).slice(0, 300), err.cause ? `cause=${err.cause.code ?? ''} ${err.cause.message ?? ''}` : ''].join(' ').trim();
      // cek status juga tanpa instanceof, supaya tetap jalan bila bundler memuat dua salinan kelas ApiError
      const status = e instanceof ApiError || err.name === 'ApiError' ? err.status : undefined;
      if (status === 429) throw new ModelError('quota', 'Kuota Gemini sedang habis.', detail);
      if (status === 400 || status === 403 || status === 404) throw new ModelError('rejected', `Gemini menolak permintaan (${status}). Periksa GEMINI_API_KEY dan GEMINI_MODEL.`, detail);
      if (status === 504) throw new ModelError('timeout', 'Gemini tidak menjawab tepat waktu.', detail);
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
