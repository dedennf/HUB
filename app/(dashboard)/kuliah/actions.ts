'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const input = z.object({ id: z.uuid(), done: z.boolean() });

/** Centang tugas dari TaskRow. Ditulis oleh pengguna sendiri, jadi tidak perlu kartu konfirmasi Ra. */
export async function setTaskDone(id: string, done: boolean): Promise<{ ok: boolean }> {
  await requireUser();
  const v = input.safeParse({ id, done });
  if (!v.success) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from('tasks')
    .update({ status: done ? 'done' : 'todo', completed_at: done ? new Date().toISOString() : null })
    .eq('id', v.data.id);
  if (error) return { ok: false };
  revalidatePath('/', 'layout');
  return { ok: true };
}
