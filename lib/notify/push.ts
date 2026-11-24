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

export function pushSender(): PushSender | null {
  if (!vapidConfigured()) return null;
  webpush.setVapidDetails(
    env('VAPID_SUBJECT') || 'mailto:pemilik@kompas.local',
    vapidPublicKey(),
    env('VAPID_PRIVATE_KEY'),
  );
  return async (sub, payload) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, payload, { TTL: 60 * 60 * 12, urgency: 'normal' });
      return { ok: true, gone: false };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      return { ok: false, gone: status === 404 || status === 410, error: `push ${status ?? ''} ${(e as Error).message}`.slice(0, 200) };
    }
  };
}
