import { NextResponse } from 'next/server';
import { resolveSessionUser } from '@/lib/auth';
import { createNotification, deliverPending } from '@/lib/notify';
import { pushSender, vapidProblem } from '@/lib/notify/push';
import { createClient } from '@/lib/supabase/server';

/** Kirim notifikasi uji ke semua perangkat sekarang juga (abaikan jam tenang). */
export async function POST() {
  const db = await createClient();
  if (!(await resolveSessionUser(db))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const problem = vapidProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 503 });
  const now = new Date();
  await createNotification(db, { title: 'Notifikasi Kompas aktif', body: 'Pengingat tenggat, tagihan, dan briefing akan muncul seperti ini.', url: '/pengaturan/notifikasi', category: 'automation' }, now, null);
  const r = await deliverPending(db, now, pushSender());
  if (!r.devices && !r.removed) return NextResponse.json({ ...r, error: 'Belum ada perangkat yang berlangganan. Tekan "Aktifkan notifikasi" dulu.' }, { status: 409 });
  if (r.errors.length) return NextResponse.json({ ...r, error: `Gagal dikirim: ${r.errors[0]}` }, { status: 502 });
  return NextResponse.json(r);
}
