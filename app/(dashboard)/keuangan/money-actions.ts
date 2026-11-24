'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { f, fieldErrors } from '@/lib/entities/fields';
import { nextBillDate } from '@/lib/entities/registry';
import { formatRp } from '@/lib/format';
import { parseRupiah } from '@/lib/money';
import { createClient } from '@/lib/supabase/server';
import { zonedToIso } from '@/lib/time';

export type ActionState = { ok: boolean; message?: string; fieldErrors?: Record<string, string> };
const UUID = /^[0-9a-f-]{36}$/i;

const payBillInput = z.object({ account_id: f.uuid('akun'), amount: f.money('Nominal').refine((n) => n > 0, 'Nominal harus lebih dari nol.'), date: f.date('Tanggal') });

/** Bayar tagihan: catat pengeluaran lalu majukan jatuh tempo (sekali bayar = nonaktif). */
export async function payBill(billId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  if (!UUID.test(billId)) return { ok: false, message: 'Tagihan tidak valid.' };
  const v = payBillInput.safeParse(Object.fromEntries(fd));
  if (!v.success) return { ok: false, message: 'Periksa isian.', fieldErrors: fieldErrors(v.error) };
  const db = await createClient();
  const { data: bill } = await db.from('bills').select('id,name,frequency,next_due_date,category_id').eq('id', billId).maybeSingle();
  if (!bill) return { ok: false, message: 'Tagihan tidak ditemukan.' };
  const tx = await db.from('transactions').insert({
    kind: 'expense', amount: v.data.amount, account_id: v.data.account_id, category_id: bill.category_id,
    note: `Bayar ${bill.name}`, occurred_at: zonedToIso(v.data.date, '12:00'), source: 'manual',
  });
  if (tx.error) return { ok: false, message: 'Gagal mencatat pembayaran.' };
  const next = bill.next_due_date ? nextBillDate(bill.next_due_date, bill.frequency) : null;
  await db.from('bills').update(next
    ? { next_due_date: next, due_day: bill.frequency === 'monthly' ? Number(next.slice(8)) : null, due_date: bill.frequency === 'monthly' ? null : next }
    : { is_active: false }).eq('id', billId);
  revalidatePath('/', 'layout');
  redirect('/keuangan?tab=rencana');
}

const payDebtInput = z.object({ amount: f.money('Nominal').refine((n) => n > 0, 'Nominal harus lebih dari nol.'), account_id: f.optUuid(), date: f.date('Tanggal') });

/** Cicilan utang atau piutang. Bila akun dipilih, transaksinya ikut dicatat. */
export async function payDebt(debtId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  if (!UUID.test(debtId)) return { ok: false, message: 'Data tidak valid.' };
  const v = payDebtInput.safeParse(Object.fromEntries(fd));
  if (!v.success) return { ok: false, message: 'Periksa isian.', fieldErrors: fieldErrors(v.error) };
  const db = await createClient();
  const { data: debt } = await db.from('debts').select('id,direction,person,amount,paid_amount').eq('id', debtId).maybeSingle();
  if (!debt) return { ok: false, message: 'Data tidak ditemukan.' };
  const rest = debt.amount - debt.paid_amount;
  if (v.data.amount > rest) return { ok: false, fieldErrors: { amount: `Maksimal ${formatRp(rest)} (sisa).` } };
  if (v.data.account_id) {
    const tx = await db.from('transactions').insert({
      kind: debt.direction === 'payable' ? 'expense' : 'income', amount: v.data.amount, account_id: v.data.account_id,
      note: debt.direction === 'payable' ? `Bayar utang ke ${debt.person}` : `Terima piutang dari ${debt.person}`,
      occurred_at: zonedToIso(v.data.date, '12:00'), source: 'manual',
    });
    if (tx.error) return { ok: false, message: 'Gagal mencatat transaksi.' };
  }
  await db.from('debts').update({ paid_amount: debt.paid_amount + v.data.amount }).eq('id', debtId);
  revalidatePath('/', 'layout');
  redirect('/keuangan?tab=rencana');
}

/** Cocokkan saldo: catat selisih dengan saldo di aplikasi bank sebagai transaksi penyesuaian. */
export async function reconcileAccount(accountId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  if (!UUID.test(accountId)) return { ok: false, message: 'Akun tidak valid.' };
  const raw = String(fd.get('actual') ?? '').trim();
  const neg = raw.startsWith('-') || raw.startsWith('−');
  const parsed = parseRupiah(neg ? raw.slice(1) : raw);
  if (parsed == null || raw === '') return { ok: false, fieldErrors: { actual: 'Saldo tidak bisa dibaca. Contoh: 1.250.000 atau 1,25jt.' } };
  const actual = neg ? -parsed : parsed;
  const db = await createClient();
  const { data: acc } = await db.from('accounts').select('id,balance').eq('id', accountId).maybeSingle();
  if (!acc) return { ok: false, message: 'Akun tidak ditemukan.' };
  const diff = actual - acc.balance;
  if (diff === 0) return { ok: true, message: 'Saldo sudah cocok. Tidak ada yang perlu dicatat.' };
  const { data: cat } = await db.from('categories').select('id').eq('slug', diff > 0 ? 'i_lain' : 'o_lain').maybeSingle();
  const { error } = await db.from('transactions').insert({
    kind: diff > 0 ? 'income' : 'expense', amount: Math.abs(diff), account_id: accountId, category_id: cat?.id ?? null,
    note: 'Penyesuaian saldo', occurred_at: new Date().toISOString(), source: 'manual',
  });
  if (error) return { ok: false, message: 'Gagal mencatat penyesuaian.' };
  revalidatePath('/', 'layout');
  return { ok: true, message: `Penyesuaian ${formatRp(diff, { sign: true })} dicatat. Saldo sekarang ${formatRp(actual)}.` };
}
