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

/** Jam briefing, rekap, review kosakata, dan jam tenang (SPEC 8.1, 8.5). Jadwal otomasi bawaan menyesuaikan di tick berikutnya. */
export async function saveSchedule(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireUser();
  const get = (k: string) => String(formData.get(k) ?? '');
  const b = SETTING_SCHEMAS.briefing_time.safeParse(get('briefing_time'));
  const r = SETTING_SCHEMAS.recap_time.safeParse(get('recap_time'));
  const v = SETTING_SCHEMAS.vocab_review_time.safeParse(get('vocab_review_time'));
  const q = SETTING_SCHEMAS.quiet_hours.safeParse([get('quiet_start'), get('quiet_end')]);
  if (!b.success || !r.success || !v.success || !q.success) return { ok: false, message: 'Isi semua jam dengan format JJ:MM.' };
  if (q.data[0] === q.data[1]) return { ok: false, message: 'Jam tenang mulai dan selesai tidak boleh sama.' };
  const ok = (await upsert('briefing_time', b.data)) && (await upsert('recap_time', r.data)) && (await upsert('vocab_review_time', v.data)) && (await upsert('quiet_hours', q.data));
  revalidatePath('/pengaturan/notifikasi');
  revalidatePath('/otomasi');
  return ok ? { ok: true, message: 'Jadwal tersimpan. Otomasi menyesuaikan dalam 5 menit.' } : { ok: false, message: 'Gagal menyimpan jadwal.' };
}

export async function markAllNotificationsRead(): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
  revalidatePath('/', 'layout');
}

/** Sakelar aktif otomasi dari halaman Otomasi. Pengguna sendiri yang menekan, jadi langsung disimpan. */
export async function setAutomationEnabled(id: string, enabled: boolean): Promise<SaveState> {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: 'Otomasi tidak valid.' };
  const supabase = await createClient();
  // diaktifkan ulang: jadwal dihitung ulang di tick berikutnya
  const { error } = await supabase.from('automations').update(enabled ? { is_enabled: true, next_run_at: null } : { is_enabled: false }).eq('id', id);
  revalidatePath('/otomasi');
  return error ? { ok: false, message: 'Gagal menyimpan.' } : { ok: true };
}

/** Hapus aturan buatan sendiri. Otomasi bawaan hanya bisa dinonaktifkan. */
export async function deleteCustomAutomation(id: string): Promise<SaveState> {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: 'Otomasi tidak valid.' };
  const supabase = await createClient();
  const { error } = await supabase.from('automations').delete().eq('id', id).eq('is_system', false);
  revalidatePath('/otomasi');
  return error ? { ok: false, message: 'Gagal menghapus.' } : { ok: true };
}
