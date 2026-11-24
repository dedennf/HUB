import { NextResponse } from 'next/server';
import { resolveSessionUser } from '@/lib/auth';
import { createNotification, deliverPending } from '@/lib/notify';
import { pushSender, vapidConfigured } from '@/lib/notify/push';
import { createClient } from '@/lib/supabase/server';

/** Kirim notifikasi uji ke semua perangkat sekarang juga (abaikan jam tenang). */
export async function POST() {
  const db = await createClient();
  if (!(await resolveSessionUser(db))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!vapidConfigured()) return NextResponse.json({ error: 'Kunci VAPID belum diisi di server, push belum bisa dikirim.' }, { status: 503 });
  const now = new Date();
  await createNotification(db, { title: 'Notifikasi Kompas aktif', body: 'Pengingat tenggat, tagihan, dan briefing akan muncul seperti ini.', url: '/pengaturan/notifikasi', category: 'automation' }, now, null);
  const r = await deliverPending(db, now, pushSender());
  return NextResponse.json(r);
}
