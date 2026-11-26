import 'server-only';
// Pengirim Web Push (SPEC 9) dengan kunci VAPID dari env. Tanpa kunci, push dilewati dan notifikasi tetap ada di lonceng.
import webpush from 'web-push';
import type { PushSender } from './index';

/** Dibaca saat runtime: process.env.NEXT_PUBLIC_* ditanam Next saat build, jadi kunci yang diisi setelah build tidak terbaca. */
const env = (k: string) => process.env[k]?.trim() ?? '';
export const vapidPublicKey = () => env(['NEXT_PUBLIC', 'VAPID_PUBLIC_KEY'].join('_'));

export function vapidConfigured(): boolean {
  return !!(vapidPublicKey() && env('VAPID_PRIVATE_KEY'));
}

/**
 * Subjek VAPID harus berupa "mailto:alamat" atau URL https. Isian umum yang keliru ("mail to x@y", "x@y",
 * "mailto: x@y") dirapikan supaya web-push tidak menolak semua pengiriman.
 */
export function normalizeSubject(raw: string): string {
  const v = raw.trim().replace(/^mail\s*to\s*:?\s*/i, 'mailto:').replace(/^mailto:\s+/i, 'mailto:');
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(v)) return v;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  if (/^https:\/\/\S+$/i.test(v)) return v;
  return 'mailto:pemilik@kompas.local';
}

/** Masalah konfigurasi push yang bisa dibaca pemilik, atau null bila siap. */
export function vapidProblem(): string | null {
  if (!vapidPublicKey()) return 'NEXT_PUBLIC_VAPID_PUBLIC_KEY belum diisi di Vercel.';
  if (!env('VAPID_PRIVATE_KEY')) return 'VAPID_PRIVATE_KEY belum diisi di Vercel.';
  try {
    webpush.setVapidDetails(normalizeSubject(env('VAPID_SUBJECT')), vapidPublicKey(), env('VAPID_PRIVATE_KEY'));
    return null;
  } catch (e) {
    return `Kunci VAPID tidak valid: ${(e as Error).message}. Buat pasangan kunci baru dengan "npx web-push generate-vapid-keys" lalu isi keduanya.`;
  }
}

export function pushSender(): PushSender | null {
  if (!vapidConfigured()) return null;
  const problem = vapidProblem();
  if (problem) {
    console.error('[push]', problem);
    return async () => ({ ok: false, gone: false, error: problem });
  }
  return async (sub, payload) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, payload, { TTL: 60 * 60 * 12, urgency: 'high' });
      return { ok: true, gone: false };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // 403 dari layanan push biasanya berarti perangkat didaftarkan dengan kunci VAPID lama
      const hint = status === 403 ? ' (kunci VAPID berubah sejak perangkat didaftarkan, daftarkan ulang perangkat)' : '';
      return { ok: false, gone: status === 404 || status === 410, error: `push ${status ?? ''} ${(e as Error).message}${hint}`.slice(0, 300) };
    }
  };
}
