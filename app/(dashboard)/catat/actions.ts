'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { fieldErrors } from '@/lib/entities/fields';
import { formDataToObject, getEntity } from '@/lib/entities/registry';
import { createClient } from '@/lib/supabase/server';

export type EntityFormState = { ok: boolean; message?: string; fieldErrors?: Record<string, string> };

const UUID = /^[0-9a-f-]{36}$/i;

function safeBack(raw: FormDataEntryValue | null, fallback: string): string {
  const v = typeof raw === 'string' ? raw : '';
  return v.startsWith('/') && !v.startsWith('//') ? v : fallback;
}

function friendly(message: string): string {
  if (/duplicate key|unique/i.test(message)) return 'Data serupa sudah ada.';
  if (/foreign key/i.test(message)) return 'Pilihan yang dipakai sudah tidak ada.';
  if (/check constraint|violates/i.test(message)) return 'Isian tidak sesuai aturan. Periksa kembali.';
  return 'Gagal menyimpan. Coba lagi.';
}

/** Simpan entitas apa pun dari registry (tambah bila id kosong, ubah bila ada). */
export async function saveEntity(key: string, _prev: EntityFormState, formData: FormData): Promise<EntityFormState> {
  await requireUser();
  const def = getEntity(key);
  if (!def) return { ok: false, message: 'Jenis data tidak dikenal.' };
  const parsed = def.schema.safeParse(formDataToObject(formData, def));
  if (!parsed.success) return { ok: false, message: 'Periksa isian yang ditandai.', fieldErrors: fieldErrors(parsed.error) };
  const rawId = String(formData.get('id') ?? '');
  const id = UUID.test(rawId) ? rawId : null;
  const supabase = await createClient();
  if (def.beforeSave) await def.beforeSave(supabase, parsed.data, id);
  const row = def.toRow(parsed.data);
  const res = id
    ? await supabase.from(def.table).update(row).eq('id', id).select('id').single()
    : await supabase.from(def.table).insert(row).select('id').single();
  if (res.error || !res.data) return { ok: false, message: friendly(res.error?.message ?? '') };
  if (def.afterSave) await def.afterSave(supabase, res.data.id as string, parsed.data);
  revalidatePath('/', 'layout');
  redirect(safeBack(formData.get('back'), def.back));
}

export async function deleteEntity(key: string, formData: FormData): Promise<void> {
  await requireUser();
  const def = getEntity(key);
  const id = String(formData.get('id') ?? '');
  if (!def || !UUID.test(id)) throw new Error('Data tidak valid.');
  const supabase = await createClient();
  if (def.canDelete) {
    const { data } = await supabase.from(def.table).select('*').eq('id', id).maybeSingle();
    const reason = data ? def.canDelete(data) : null;
    if (reason) throw new Error(reason);
  }
  const { error } = await supabase.from(def.table).delete().eq('id', id);
  if (error) throw new Error(friendly(error.message));
  revalidatePath('/', 'layout');
  redirect(safeBack(formData.get('back'), def.back));
}
