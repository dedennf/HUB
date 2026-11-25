// Menjalankan fungsi Gemini modul Bahasa dengan pesan galat yang ramah (SPEC 12). Hanya di server.
import { defaultModel, ModelError, type AgentModel } from '@/lib/agent/model';

export type Result<T> = { ok: true; data: T } | { ok: false; message: string };

const OFFLINE: Record<ModelError['reason'], string> = {
  not_configured: 'Gemini belum diatur', quota: 'kuota Gemini habis', timeout: 'Gemini terlalu lama menjawab', rejected: 'permintaan ditolak Gemini', unavailable: 'Gemini tidak bisa dihubungi',
};

export async function withModel<T>(fn: (m: AgentModel) => Promise<T>): Promise<Result<T>> {
  const model = defaultModel();
  if (!model) return { ok: false, message: 'Ra belum tersambung ke Gemini, fitur ini belum bisa dipakai.' };
  try {
    return { ok: true, data: await fn(model) };
  } catch (e) {
    if (e instanceof ModelError) {
      console.error('[english] Gemini gagal:', e.reason, e.detail);
      return { ok: false, message: `Ra tidak bisa menjawab sekarang (${OFFLINE[e.reason]}). Coba lagi sebentar.` };
    }
    console.error('[english] galat:', e);
    return { ok: false, message: 'Jawaban Ra tidak terbaca. Coba lagi.' };
  }
}
