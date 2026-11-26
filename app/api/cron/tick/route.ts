import { timingSafeEqual } from 'node:crypto';
import { withUsage } from '@/lib/ai-usage';
import { NextResponse } from 'next/server';
import { defaultModel } from '@/lib/agent/model';
import { runTick } from '@/lib/automation/engine';
import { ownerSession } from '@/lib/automation/session';
import { ownerEmail, supabasePublicEnv } from '@/lib/env';
import { pushSender } from '@/lib/notify/push';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const got = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
  if (!secret || !got || got.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

/**
 * SPEC 8.3: dipanggil pg_cron (POST lewat pg_net) tiap 5 menit, dan Vercel Cron (GET) sekali sehari sebagai cadangan.
 * Hanya menerima Authorization: Bearer CRON_SECRET.
 */
async function tick(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY belum diisi.' }, { status: 500 });
  const { url, anonKey } = supabasePublicEnv();
  let session: Awaited<ReturnType<typeof ownerSession>> | null = null;
  try {
    session = await ownerSession({ url, anonKey, serviceKey, email: ownerEmail() });
    const db = session.db;
    const report = await withUsage(db, 'automation', () => runTick(db, { model: defaultModel(), push: pushSender() }));
    if (report.ran.length || report.delivered.sent) console.log('[cron] tick:', JSON.stringify(report));
    // jejak untuk halaman Notifikasi: bukti penjadwal benar-benar jalan
    await session.db.from('settings').upsert({ key: 'cron_last_tick', value: { at: new Date().toISOString(), sent: report.delivered.sent, errors: report.delivered.errors.slice(0, 3) } }, { onConflict: 'user_id,key' });
    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[cron] tick gagal:', e);
    return NextResponse.json({ error: (e as Error).message.slice(0, 200) }, { status: 500 });
  } finally {
    await session?.close();
  }
}

export const GET = tick;
export const POST = tick;
