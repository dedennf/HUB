import { NextResponse } from 'next/server';
import { isOwnerEmail } from '@/lib/env';
import { EXPORT_TABLES, stripUser } from '@/lib/export';
import { createClient } from '@/lib/supabase/server';
import { todayIso } from '@/lib/time';

/** Unduh seluruh data sebagai JSON (cadangan Kompas). */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || !isOwnerEmail(auth.user.email)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const data: Record<string, unknown[]> = {};
  for (const t of EXPORT_TABLES) {
    const { data: rows, error } = await supabase.from(t).select('*').order('created_at');
    if (error) return NextResponse.json({ error: `Gagal membaca ${t}` }, { status: 500 });
    data[t] = stripUser(rows ?? []);
  }
  const body = JSON.stringify({ app: 'kompas', version: 1, exported: new Date().toISOString(), data }, null, 1);
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="kompas-cadangan-${todayIso()}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
