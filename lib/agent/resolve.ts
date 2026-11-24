// Resolusi nama bebas ke id (SPEC 6.8 "Resolusi nama"): nama, alias, memori agen.
// Lebih dari satu kandidat = kembalikan daftar kandidat agar agen bertanya, bukan menebak.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Candidate } from './tools/types';

export type Named = { id: string; name: string; aliases?: string[]; extra?: string };
export type Resolution = { kind: 'found'; id: string; label: string } | { kind: 'ambiguous'; candidates: Candidate[] } | { kind: 'not_found' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Cocokkan teks ke daftar item. Urutan: id persis, nama/alias persis, awalan, mengandung (dua arah),
 * lalu semua kata kueri muncul. Tingkat pertama yang menghasilkan kandidat dipakai.
 */
export function matchName(query: string, items: Named[], opts: { exact?: boolean } = {}): Resolution {
  const q = normalize(query);
  if (!q) return { kind: 'not_found' };
  if (isUuid(query.trim())) {
    const hit = items.find((i) => i.id === query.trim());
    return hit ? { kind: 'found', id: hit.id, label: hit.name } : { kind: 'not_found' };
  }
  const names = (i: Named) => [i.name, ...(i.aliases ?? [])].map(normalize).filter(Boolean);
  const tiers: ((n: string) => boolean)[] = [
    (n) => n === q,
    (n) => n.startsWith(q) || q.startsWith(`${n} `),
    (n) => n.includes(q) || (n.length >= 3 && q.includes(n)),
    (n) => q.split(' ').every((w) => n.split(' ').some((x) => x.startsWith(w))),
  ];
  for (const test of opts.exact ? tiers.slice(0, 1) : tiers) {
    const hits = items.filter((i) => names(i).some(test));
    if (hits.length === 1) return { kind: 'found', id: hits[0].id, label: hits[0].name };
    if (hits.length > 1) return { kind: 'ambiguous', candidates: hits.slice(0, 8).map((h) => ({ id: h.id, label: h.extra ? `${h.name} (${h.extra})` : h.name })) };
  }
  return { kind: 'not_found' };
}

type Db = SupabaseClient;

/** Memori alias: "atm kuning" → { account_id } dsb. */
async function memoryAlias(db: Db, phrase: string, field: string): Promise<string | null> {
  const { data } = await db.from('agent_memory').select('key,value').eq('kind', 'alias');
  const q = normalize(phrase);
  const hit = (data ?? []).find((m) => normalize(String(m.key)) === q && m.value && typeof m.value === 'object' && field in m.value);
  return hit ? String((hit.value as Record<string, unknown>)[field]) : null;
}

const ACCOUNT_TYPE: Record<string, string> = { bank: 'bank', ewallet: 'dompet digital', cash: 'tunai', investment: 'investasi' };

export async function resolveAccount(db: Db, name: string): Promise<Resolution> {
  const { data } = await db.from('accounts').select('id,name,aliases,type').eq('is_archived', false);
  const items: Named[] = (data ?? []).map((a) => ({ id: a.id, name: a.name, aliases: a.aliases ?? [], extra: ACCOUNT_TYPE[a.type] }));
  const fromMemory = await memoryAlias(db, name, 'account_id');
  if (fromMemory) {
    const hit = items.find((i) => i.id === fromMemory);
    if (hit) return { kind: 'found', id: hit.id, label: hit.name };
  }
  const r = matchName(name, items);
  // "tunai" / "cash" / "dompet" tanpa akun bernama itu: pakai satu-satunya akun tunai
  if (r.kind === 'not_found' && /^(tunai|cash|uang tunai|dompet)$/i.test(name.trim())) {
    const cash = (data ?? []).filter((a) => a.type === 'cash');
    if (cash.length === 1) return { kind: 'found', id: cash[0].id, label: cash[0].name };
  }
  return r;
}

/** `exact`: hanya nama atau kata kunci yang sama persis, untuk menebak dari kata lepas di catatan. */
export async function resolveCategory(db: Db, name: string, kind: 'expense' | 'income', opts: { exact?: boolean } = {}): Promise<Resolution> {
  const { data } = await db.from('categories').select('id,name,keywords,subcategories').eq('kind', kind).eq('is_hidden', false);
  const items: Named[] = (data ?? []).map((c) => ({ id: c.id, name: c.name, aliases: [...(c.keywords ?? []), ...(c.subcategories ?? [])] }));
  const fromMemory = await memoryAlias(db, name, 'category_id');
  if (fromMemory && items.some((i) => i.id === fromMemory)) return { kind: 'found', id: fromMemory, label: items.find((i) => i.id === fromMemory)!.name };
  return matchName(name, items, opts);
}

export async function resolveCourse(db: Db, name: string): Promise<Resolution> {
  const [{ data }, { data: sem }] = await Promise.all([
    db.from('courses').select('id,name,alias,code,semester_id'),
    db.from('semesters').select('id').eq('is_active', true).maybeSingle(),
  ]);
  const all = data ?? [];
  const toItem = (c: (typeof all)[number]): Named => ({ id: c.id, name: c.name, aliases: [c.alias, c.code].filter(Boolean) as string[] });
  const fromMemory = await memoryAlias(db, name, 'course_id');
  const learned = fromMemory ? all.find((c) => c.id === fromMemory) : undefined;
  if (learned) return { kind: 'found', id: learned.id, label: learned.name };
  // utamakan mata kuliah semester aktif
  const active = all.filter((c) => c.semester_id && c.semester_id === sem?.id);
  const r = active.length ? matchName(name, active.map(toItem)) : { kind: 'not_found' as const };
  return r.kind === 'not_found' ? matchName(name, all.map(toItem)) : r;
}

export async function resolveProject(db: Db, name: string): Promise<Resolution> {
  const { data } = await db.from('research_projects').select('id,title,status');
  return matchName(name, (data ?? []).map((p) => ({ id: p.id, name: p.title, extra: p.status === 'active' ? undefined : p.status })));
}

/** Proyek aktif pertama, untuk parameter proyek yang tidak disebut. */
export async function defaultProject(db: Db): Promise<string | null> {
  const { data } = await db.from('research_projects').select('id').eq('status', 'active').order('created_at').limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function resolveTask(db: Db, title: string, openOnly = true): Promise<Resolution> {
  let q = db.from('tasks').select('id,title,due_at,status');
  if (openOnly) q = q.neq('status', 'done');
  const { data } = await q;
  return matchName(title, (data ?? []).map((t) => ({ id: t.id, name: t.title, extra: t.due_at ? String(t.due_at).slice(0, 10) : undefined })));
}

export async function resolveTarget(db: Db, title: string): Promise<Resolution> {
  const { data } = await db.from('research_targets').select('id,title,progress');
  return matchName(title, (data ?? []).map((t) => ({ id: t.id, name: t.title, extra: `${t.progress}%` })));
}

export async function resolveInvestment(db: Db, name: string): Promise<Resolution> {
  const { data } = await db.from('investments').select('id,name,instrument');
  return matchName(name, (data ?? []).map((v) => ({ id: v.id, name: v.name, extra: v.instrument })));
}

export async function resolveAutomation(db: Db, name: string): Promise<Resolution> {
  const { data } = await db.from('automations').select('id,name');
  return matchName(name, (data ?? []).map((a) => ({ id: a.id, name: a.name })));
}
