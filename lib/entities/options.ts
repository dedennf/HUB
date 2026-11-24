import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import type { EntityDef, OptionSource } from './registry';

type Db = Awaited<ReturnType<typeof createClient>>;
type Option = { value: string; label: string };

/** Pilihan untuk field select bersumber data (mata kuliah, akun, kategori, proyek, semester). */
export async function loadOptions(db: Db, def: EntityDef): Promise<Record<string, Option[]>> {
  const sources = new Set(def.fields.map((f) => f.source).filter((s): s is OptionSource => !!s));
  const out: Record<string, Option[]> = {};
  const load: Record<OptionSource, () => Promise<Option[]>> = {
    courses: async () => ((await db.from('courses').select('id,name,alias').order('name')).data ?? [])
      .map((c) => ({ value: c.id as string, label: c.alias ? `${c.name} (${c.alias})` : (c.name as string) })),
    accounts: async () => ((await db.from('accounts').select('id,name').eq('is_archived', false).order('sort_order').order('name')).data ?? [])
      .map((a) => ({ value: a.id as string, label: a.name as string })),
    expenseCategories: async () => ((await db.from('categories').select('id,name').eq('kind', 'expense').eq('is_hidden', false).order('sort_order')).data ?? [])
      .map((c) => ({ value: c.id as string, label: c.name as string })),
    projects: async () => ((await db.from('research_projects').select('id,title').order('created_at')).data ?? [])
      .map((p) => ({ value: p.id as string, label: p.title as string })),
    semesters: async () => ((await db.from('semesters').select('id,name,is_active').order('number')).data ?? [])
      .map((s) => ({ value: s.id as string, label: `${s.name}${s.is_active ? ' (aktif)' : ''}` })),
  };
  await Promise.all([...sources].map(async (s) => { out[s] = await load[s](); }));
  return out;
}
