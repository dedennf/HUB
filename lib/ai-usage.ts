// Meteran pemakaian Gemini (ROADMAP Fase 9). Hanya di server.
// Lingkup (AsyncLocalStorage) dipasang di pintu masuk (route, server action, cron) supaya setiap panggilan
// Gemini di dalamnya tercatat ke `ai_usage` dan bisa dihentikan bila batas token harian tercapai.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { SupabaseClient } from '@supabase/supabase-js';
import { todayIso, zonedToIso } from './time';

export type AiFeature = 'agent' | 'receipt' | 'english' | 'english_tts' | 'automation' | 'diagnose';
export type UsageRecord = { model: string; input_tokens: number; output_tokens: number; total_tokens: number; ok: boolean };
type Scope = { feature: AiFeature; db: SupabaseClient; overBudget: boolean; pending: Promise<unknown>[] };

const store = new AsyncLocalStorage<Scope>();

/** Kunci pengaturan batas token harian. 0 atau kosong berarti tanpa batas. */
export const DAILY_LIMIT_KEY = 'ai_daily_token_limit';

export function readDailyLimit(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Ubah usageMetadata Gemini menjadi angka token. Field yang hilang dianggap 0. */
export function usageFrom(model: string, meta: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number } | undefined, ok = true): UsageRecord {
  const input = meta?.promptTokenCount ?? 0;
  const output = (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0);
  return { model, input_tokens: input, output_tokens: output, total_tokens: meta?.totalTokenCount ?? input + output, ok };
}

/** Total token hari ini (zona Asia/Jakarta) dan batasnya. */
export async function usageToday(db: SupabaseClient, now = new Date()): Promise<{ used: number; limit: number }> {
  const [rows, setting] = await Promise.all([
    db.from('ai_usage').select('total_tokens').gte('created_at', zonedToIso(todayIso(now))),
    db.from('settings').select('value').eq('key', DAILY_LIMIT_KEY).maybeSingle(),
  ]);
  const used = (rows.data ?? []).reduce((n, r) => n + (r.total_tokens ?? 0), 0);
  return { used, limit: readDailyLimit(setting.data?.value) };
}

/**
 * Jalankan `fn` di dalam lingkup meteran. Pemakaian dicatat ke tabel milik pengguna `db`.
 * Bila batas harian sudah tercapai, panggilan Gemini di dalamnya langsung gagal dengan alasan `budget`.
 * Galat meteran tidak pernah menggagalkan fitur.
 */
export async function withUsage<T>(db: SupabaseClient, feature: AiFeature, fn: () => Promise<T>): Promise<T> {
  let overBudget = false;
  try {
    const { used, limit } = await usageToday(db);
    overBudget = limit > 0 && used >= limit;
  } catch (e) {
    console.warn('[ai-usage] gagal membaca pemakaian:', (e as Error).message);
  }
  const scope: Scope = { feature, db, overBudget, pending: [] };
  try {
    return await store.run(scope, fn);
  } finally {
    await Promise.allSettled(scope.pending);
  }
}

/** True bila lingkup aktif sudah melewati batas harian. */
export function overDailyBudget(): boolean {
  return store.getStore()?.overBudget ?? false;
}

/** Catat satu panggilan. Di luar lingkup (uji, diagnosa tanpa sesi) tidak melakukan apa-apa. */
export function reportUsage(rec: UsageRecord): void {
  const scope = store.getStore();
  if (!scope) return;
  const p = Promise.resolve(scope.db.from('ai_usage').insert({ feature: scope.feature, ...rec })).then((r) => {
    if (r.error) console.warn('[ai-usage] gagal mencatat:', r.error.message);
  }, (e) => console.warn('[ai-usage] gagal mencatat:', (e as Error).message));
  scope.pending.push(p);
}
