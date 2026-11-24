// Uji Live API dari server (D-56): buat token sementara dengan konfigurasi terkunci yang sama seperti untuk pengguna,
// sambung lewat token itu, kirim satu pesan teks, dan tunggu jawaban pertama. Memastikan model Live, tools, dan token valid.
import { GoogleGenAI, Modality, type LiveConnectConfig } from '@google/genai';
import type { DiagnoseCase } from '@/lib/agent/diagnose';

export async function diagnoseLive(apiKey: string, model: string, config: LiveConnectConfig, opts: { baseUrl?: string; timeoutMs?: number } = {}): Promise<DiagnoseCase> {
  const t0 = Date.now();
  const test = `percakapan langsung (Live API, ${config.tools ? 'dengan tool' : 'tanpa tool'})`;
  const http = { apiVersion: 'v1alpha', ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}) };
  try {
    const admin = new GoogleGenAI({ apiKey, httpOptions: http });
    const token = await admin.authTokens.create({ config: { uses: 1, expireTime: new Date(Date.now() + 5 * 60_000).toISOString(), liveConnectConstraints: { model, config }, httpOptions: { apiVersion: 'v1alpha' } } });
    if (!token.name) throw new Error('token kosong');
    const ai = new GoogleGenAI({ apiKey: token.name, httpOptions: http });
    const reply = await new Promise<string>((resolve, reject) => {
      let text = '';
      let audioBytes = 0;
      const timer = setTimeout(() => reject(new Error(`tidak ada jawaban dalam ${opts.timeoutMs ?? 20_000} ms`)), opts.timeoutMs ?? 20_000);
      ai.live.connect({
        model,
        config: { responseModalities: [Modality.AUDIO] },
        callbacks: {
          onmessage: (m) => {
            text += m.serverContent?.outputTranscription?.text ?? '';
            for (const p of m.serverContent?.modelTurn?.parts ?? []) audioBytes += p.inlineData?.data?.length ?? 0;
            if (m.serverContent?.turnComplete || m.toolCall) {
              clearTimeout(timer);
              resolve(m.toolCall ? `memanggil tool ${m.toolCall.functionCalls?.map((f) => f.name).join(', ')}` : `${text.trim() || '(audio)'} · ${Math.round(audioBytes * 0.75 / 48)} ms audio`);
            }
          },
          onerror: (e) => { clearTimeout(timer); reject(new Error(String((e as ErrorEvent).message ?? 'galat websocket'))); },
          onclose: (e) => { clearTimeout(timer); reject(new Error(`ditutup ${e.code}${e.reason ? `: ${e.reason}` : ''}`)); },
        },
      }).then((s) => {
        s.sendClientContent({ turns: [{ role: 'user', parts: [{ text: 'Balas satu kata: siap.' }] }], turnComplete: true });
        // tutup setelah selesai supaya tidak menggantung
        setTimeout(() => { try { s.close(); } catch { /* */ } }, opts.timeoutMs ?? 20_000);
      }, reject);
    });
    return { model, test, ok: true, ms: Date.now() - t0, reply: reply.slice(0, 120) };
  } catch (e) {
    const err = e as Error & { status?: number };
    return { model, test, ok: false, ms: Date.now() - t0, reason: err.status === 429 ? 'quota' : 'galat', detail: `${err.status ?? ''} ${err.message}`.trim().slice(0, 400) };
  }
}
