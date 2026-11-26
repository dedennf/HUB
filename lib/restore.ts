// Pemulihan dari cadangan Kompas (D-34, D-70). Bagian murni (tanpa database) supaya bisa diuji.
// Pemulihan hanya menambah baris yang hilang. Data yang ada tidak ditimpa dan tidak dihapus.
import { z } from 'zod';
import { EXPORT_TABLES } from './export';

type Row = Record<string, unknown>;
export type RestoreTable = (typeof EXPORT_TABLES)[number];

export const kompasBackup = z.object({
  app: z.literal('kompas'),
  version: z.literal(1),
  exported: z.string(),
  data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});
export type KompasBackupInput = z.infer<typeof kompasBackup>;

export type ExistingState = {
  /** slug kategori → id kategori yang sudah ada */
  categoryBySlug: Map<string, string>;
  /** id semester aktif saat ini, bila ada */
  activeSemesterId: string | null;
};

export type PreparedRestore = {
  tables: Partial<Record<RestoreTable, Row[]>>;
  /** tabel di cadangan yang tidak dikenali dan diabaikan */
  ignored: string[];
  /** kategori cadangan yang digabung ke kategori bawaan dengan slug sama */
  mergedCategories: number;
};

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rapikan isi cadangan sebelum dikirim ke `restore_kompas_backup`. */
export function prepareRestore(backup: KompasBackupInput, existing: ExistingState): PreparedRestore {
  const known = new Set<string>(EXPORT_TABLES);
  const ignored = Object.keys(backup.data).filter((t) => !known.has(t));
  const tables: Partial<Record<RestoreTable, Row[]>> = {};
  for (const t of EXPORT_TABLES) {
    const rows = (backup.data[t] ?? []).filter((r) => typeof r.id === 'string' && ID.test(r.id));
    if (rows.length) tables[t] = rows.map((r) => ({ ...r }));
  }

  // kategori bawaan punya slug unik per pengguna: id di cadangan dipetakan ke kategori yang sudah ada
  const remap = new Map<string, string>();
  tables.categories = (tables.categories ?? []).filter((c) => {
    const target = typeof c.slug === 'string' ? existing.categoryBySlug.get(c.slug) : undefined;
    if (target && target !== c.id) { remap.set(c.id as string, target); return false; }
    return true;
  });
  for (const t of ['transactions', 'bills'] as const) {
    for (const r of tables[t] ?? []) {
      const to = typeof r.category_id === 'string' ? remap.get(r.category_id) : undefined;
      if (to) r.category_id = to;
    }
  }

  // foto struk tidak ikut cadangan
  for (const r of tables.transactions ?? []) r.receipt_id = null;

  // hanya boleh satu semester aktif
  if (existing.activeSemesterId) {
    for (const r of tables.semesters ?? []) if (r.is_active && r.id !== existing.activeSemesterId) r.is_active = false;
  }

  for (const t of Object.keys(tables) as RestoreTable[]) if (!tables[t]?.length) delete tables[t];
  return { tables, ignored, mergedCategories: remap.size };
}

/** Jumlah baris per tabel yang belum ada (berdasarkan id). */
export function countMissing(tables: PreparedRestore['tables'], existingIds: Partial<Record<RestoreTable, Set<string>>>): Partial<Record<RestoreTable, { total: number; missing: number }>> {
  const out: Partial<Record<RestoreTable, { total: number; missing: number }>> = {};
  for (const [t, rows] of Object.entries(tables) as [RestoreTable, Row[]][]) {
    const have = existingIds[t] ?? new Set<string>();
    out[t] = { total: rows.length, missing: rows.filter((r) => !have.has(r.id as string)).length };
  }
  return out;
}
