'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { SETTING_SCHEMAS, type SettingKey } from '@/lib/settings';
import { createClient } from '@/lib/supabase/server';

export type SaveState = { ok: boolean; message?: string };

async function upsert(key: SettingKey, value: unknown): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from('settings').upsert({ key, value }, { onConflict: 'user_id,key' });
  return !error;
}

export async function saveTheme(theme: string): Promise<SaveState> {
  await requireUser();
  const v = SETTING_SCHEMAS.theme.safeParse(theme);
  if (!v.success) return { ok: false, message: 'Pilihan tema tidak valid.' };
  const ok = await upsert('theme', v.data);
  revalidatePath('/', 'layout');
  return ok ? { ok: true } : { ok: false, message: 'Gagal menyimpan tema.' };
}

export async function saveProfile(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireUser();
  const name = SETTING_SCHEMAS.profile_name.safeParse(formData.get('profile_name') ?? '');
  const program = SETTING_SCHEMAS.profile_program.safeParse(formData.get('profile_program') ?? '');
  if (!name.success || !program.success) return { ok: false, message: 'Nama maksimal 40 huruf, program maksimal 60 huruf.' };
  const ok = (await upsert('profile_name', name.data)) && (await upsert('profile_program', program.data));
  revalidatePath('/', 'layout');
  return ok ? { ok: true, message: 'Profil tersimpan.' } : { ok: false, message: 'Gagal menyimpan profil.' };
}
