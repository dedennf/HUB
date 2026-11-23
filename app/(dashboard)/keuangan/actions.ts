'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { accountInput, transactionInput, zodFieldErrors, type FormState } from '@/lib/schemas';
import { createClient } from '@/lib/supabase/server';
import { formatRp } from '@/lib/format';
import { zonedToIso } from '@/lib/time';

const fail = (message: string, fieldErrors?: Record<string, string>): FormState => ({ ok: false, message, fieldErrors });

function friendlyDbError(message: string): string {
  if (/check constraint|violates/.test(message)) return 'Data tidak sesuai aturan. Periksa kembali isian.';
  if (/foreign key|tidak ditemukan/.test(message)) return 'Akun atau kategori yang dipilih sudah tidak ada.';
  return 'Gagal menyimpan. Coba lagi.';
}

function txRow(v: ReturnType<typeof transactionInput.parse>) {
  return {
    kind: v.kind,
    amount: v.amount,
    account_id: v.account_id,
    to_account_id: v.kind === 'transfer' ? v.to_account_id : null,
    category_id: v.kind === 'transfer' ? null : v.category_id,
    subcategory: v.kind === 'transfer' ? null : v.subcategory,
    note: v.note,
    occurred_at: zonedToIso(v.date, v.time),
  };
}

export type TxFormState = FormState & { createdId?: string; summary?: string; nonce?: number };

const KIND_LABEL = { expense: 'Pengeluaran', income: 'Pemasukan', transfer: 'Transfer' } as const;

export async function saveTransaction(_prev: TxFormState, formData: FormData): Promise<TxFormState> {
  await requireUser();
  const parsed = transactionInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail('Periksa isian yang ditandai.', zodFieldErrors(parsed.error));
  const id = String(formData.get('id') ?? '');
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from('transactions').update(txRow(parsed.data)).eq('id', id);
    if (error) return fail(friendlyDbError(error.message));
    revalidatePath('/', 'layout');
    redirect('/keuangan?tab=transaksi');
  }
  const { data, error } = await supabase.from('transactions').insert({ ...txRow(parsed.data), source: 'manual' }).select('id').single();
  if (error || !data) return fail(friendlyDbError(error?.message ?? ''));
  revalidatePath('/', 'layout');
  return {
    ok: true,
    createdId: data.id as string,
    summary: `${KIND_LABEL[parsed.data.kind]} ${formatRp(parsed.data.amount)}`,
    nonce: Date.now(),
  };
}

/** Tombol "Batalkan" di toast setelah menyimpan: menghapus transaksi yang baru dibuat. Saldo ikut kembali lewat pemicu. */
export async function undoTransaction(id: string): Promise<{ ok: boolean }> {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from('transactions').delete().eq('id', id).eq('source', 'manual');
  revalidatePath('/', 'layout');
  return { ok: !error };
}

export async function deleteTransaction(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get('id') ?? '');
  const supabase = await createClient();
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw new Error(friendlyDbError(error.message));
  revalidatePath('/', 'layout');
  redirect('/keuangan?tab=transaksi');
}

export async function saveAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = accountInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail('Periksa isian yang ditandai.', zodFieldErrors(parsed.error));
  const id = String(formData.get('id') ?? '');
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from('accounts').update(parsed.data).eq('id', id)
    : await supabase.from('accounts').insert(parsed.data);
  if (error) return fail(friendlyDbError(error.message));
  revalidatePath('/', 'layout');
  if (id) redirect('/keuangan');
  return { ok: true, message: 'Akun tersimpan.' };
}
