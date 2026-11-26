import { NextResponse } from 'next/server';
import { isOwnerEmail } from '@/lib/env';
import { buildBackup } from '@/lib/backup';
import { createClient } from '@/lib/supabase/server';
import { todayIso } from '@/lib/time';

/** Unduh seluruh data sebagai JSON (cadangan Kompas). */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || !isOwnerEmail(auth.user.email)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: string;
  try {
    body = JSON.stringify(await buildBackup(supabase), null, 1);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="kompas-cadangan-${todayIso()}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
