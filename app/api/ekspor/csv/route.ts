import { NextResponse } from 'next/server';
import { isOwnerEmail } from '@/lib/env';
import { transactionsCsv } from '@/lib/export';
import { createClient } from '@/lib/supabase/server';
import { todayIso, zonedParts } from '@/lib/time';

/** Unduh semua transaksi sebagai CSV. */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || !isOwnerEmail(auth.user.email)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const [tx, acc, cat] = await Promise.all([
    supabase.from('transactions').select('occurred_at,kind,amount,account_id,to_account_id,category_id,subcategory,note,source').order('occurred_at'),
    supabase.from('accounts').select('id,name'),
    supabase.from('categories').select('id,name'),
  ]);
  if (tx.error) return NextResponse.json({ error: 'Gagal membaca transaksi' }, { status: 500 });
  const csv = transactionsCsv(tx.data ?? [], new Map((acc.data ?? []).map((a) => [a.id, a.name])), new Map((cat.data ?? []).map((c) => [c.id, c.name])), (iso) => zonedParts(iso));
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="kompas-transaksi-${todayIso()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
