// Notifikasi (SPEC 9): selalu tersimpan di tabel notifications (lonceng), lalu dikirim sebagai push ke semua
// perangkat. Jam tenang menunda pengiriman (deliver_after). dedupe_key mencegah pengingat yang sama terkirim dua kali.
import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverAfter, type Quiet } from '@/lib/automation/time';

export type NotifyCategory = 'briefing' | 'recap' | 'deadline' | 'task' | 'bill' | 'budget' | 'anomaly' | 'english' | 'research' | 'automation';
export type NotificationInput = {
  title: string; body?: string; url?: string; category: NotifyCategory;
  /** Kunci unik per pengguna. Notifikasi dengan kunci yang sudah ada dilewati. */
  dedupe_key?: string;
  /** Waktu peristiwa (mis. tenggat). Bila jatuh di dalam jam tenang, notifikasi tetap dikirim langsung. */
  event_at?: Date | null;
};

/** Simpan notifikasi. Kembalikan true bila baru, false bila duplikat. */
export async function createNotification(db: SupabaseClient, n: NotificationInput, now: Date, quiet: Quiet): Promise<boolean> {
  const after = deliverAfter(now, quiet, n.event_at ?? null);
  const row = {
    title: n.title.slice(0, 120), body: n.body?.slice(0, 600) ?? null, url: n.url ?? '/', category: n.category,
    dedupe_key: n.dedupe_key ?? null, deliver_after: after?.toISOString() ?? null,
  };
  const { data, error } = n.dedupe_key
    ? await db.from('notifications').upsert(row, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true }).select('id')
    : await db.from('notifications').insert(row).select('id');
  if (error) throw new Error(`Gagal menyimpan notifikasi: ${error.message}`);
  return (data ?? []).length > 0;
}

export type PushSender = (sub: { endpoint: string; keys: Record<string, string> }, payload: string) => Promise<{ ok: boolean; gone: boolean; error?: string }>;

/** Kirim notifikasi yang jatuh tempo ke semua perangkat. Langganan yang hilang (404/410) dihapus. */
export async function deliverPending(db: SupabaseClient, now: Date, send: PushSender | null): Promise<{ sent: number; devices: number; removed: number; errors: string[] }> {
  const { data: due } = await db.from('notifications').select('id,title,body,url,category,deliver_after')
    .is('sent_at', null).or(`deliver_after.is.null,deliver_after.lte.${now.toISOString()}`).order('created_at').limit(50);
  const list = due ?? [];
  if (!list.length) return { sent: 0, devices: 0, removed: 0, errors: [] };
  const { data: subs } = send ? await db.from('push_subscriptions').select('id,endpoint,keys') : { data: [] };
  const errors: string[] = [];
  const gone = new Set<string>();
  for (const n of list) {
    for (const s of subs ?? []) {
      if (gone.has(s.id)) continue;
      const r = await send!({ endpoint: s.endpoint, keys: s.keys as Record<string, string> }, JSON.stringify({ title: n.title, body: n.body ?? '', url: n.url ?? '/', tag: n.category }));
      if (r.gone) gone.add(s.id);
      else if (!r.ok && r.error) errors.push(r.error);
    }
  }
  if (gone.size) await db.from('push_subscriptions').delete().in('id', [...gone]);
  // ditandai terkirim walau tanpa perangkat: tetap tampil di lonceng, tidak dikirim ulang terus-menerus
  await db.from('notifications').update({ sent_at: now.toISOString() }).in('id', list.map((n) => n.id));
  return { sent: list.length, devices: (subs ?? []).length - gone.size, removed: gone.size, errors: errors.slice(0, 5) };
}
