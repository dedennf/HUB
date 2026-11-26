// Cadangan Kompas: dipakai unduhan manual (/api/ekspor/json) dan cadangan otomatis mingguan (ROADMAP Fase 9).
import type { SupabaseClient } from '@supabase/supabase-js';
import { EXPORT_TABLES, stripUser } from './export';

export const BACKUP_BUCKET = 'backups';
export const BACKUPS_KEPT = 8;

export type KompasBackup = { app: 'kompas'; version: 1; exported: string; data: Record<string, unknown[]> };

/** Seluruh tabel data pengguna tanpa kolom user_id. Galat baca satu tabel menggagalkan seluruh cadangan. */
export async function buildBackup(db: SupabaseClient, now = new Date()): Promise<KompasBackup> {
  const data: Record<string, unknown[]> = {};
  for (const t of EXPORT_TABLES) {
    const { data: rows, error } = await db.from(t).select('*').order('created_at');
    if (error) throw new Error(`Gagal membaca ${t}: ${error.message}`);
    data[t] = stripUser(rows ?? []);
  }
  return { app: 'kompas', version: 1, exported: now.toISOString(), data };
}

/** Nama berkas lama yang dihapus supaya tersisa `keep` cadangan terbaru. Nama berisi tanggal, jadi urutan nama = urutan waktu. */
export function backupsToPrune(names: string[], keep = BACKUPS_KEPT): string[] {
  const mine = names.filter((n) => /^kompas-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
  return mine.slice(0, Math.max(0, mine.length - keep));
}

/** Simpan cadangan ke bucket privat lalu rapikan cadangan lama. Mengembalikan path dan jumlah baris. */
export async function writeBackup(db: SupabaseClient, userId: string, date: string, now = new Date()): Promise<{ path: string; rows: number; pruned: number }> {
  const backup = await buildBackup(db, now);
  const path = `${userId}/kompas-${date}.json`;
  const body = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const up = await db.storage.from(BACKUP_BUCKET).upload(path, body, { contentType: 'application/json', upsert: true });
  if (up.error) throw new Error(`Gagal menyimpan cadangan: ${up.error.message}`);
  const { data: list } = await db.storage.from(BACKUP_BUCKET).list(userId, { limit: 100 });
  const old = backupsToPrune((list ?? []).map((f) => f.name));
  if (old.length) await db.storage.from(BACKUP_BUCKET).remove(old.map((n) => `${userId}/${n}`));
  const rows = Object.values(backup.data).reduce((n, r) => n + r.length, 0);
  return { path, rows, pruned: old.length };
}
