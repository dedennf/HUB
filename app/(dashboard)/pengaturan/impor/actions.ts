'use server';
import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { importOverrides, legacyBackup, type ImportOverrides } from '@/lib/legacy/schema';
import { transformLegacyBackup, type ImportWarning, type TransformResult } from '@/lib/legacy/transform';
import { formatRupiah } from '@/lib/money';
import { createClient } from '@/lib/supabase/server';
import { formatDateId } from '@/lib/time';

export type PreviewWarning = { key: string; text: string; fix?: 'tx_date' | 'semester' | 'bill_account'; ref?: string };
export type ImportPreview = {
  ok: true;
  exported: string | null;
  counts: TransformResult['counts'];
  newRows: number;
  warnings: PreviewWarning[];
  blockers: string[];
  semesters: TransformResult['semesters'];
  accounts: TransformResult['accounts'];
};
export type ImportOutcome = {
  ok: true;
  inserted: Record<string, number>;
  balances: { name: string; expected: number; actual: number | null }[];
};
type Fail = { ok: false; message: string };

const TABLE_LABEL: Record<string, string> = {
  accounts: 'akun', categories: 'kategori', transactions: 'transaksi', schedule: 'jadwal', tasks: 'tugas', events: 'acara',
  holidays: 'libur', bills: 'tagihan', courses: 'mata kuliah', milestones: 'target riset', literature: 'literatur',
  goals: 'target tabungan', debts: 'utang', trueExp: 'biaya sejati', investments: 'investasi', budgets: 'anggaran',
  materials: 'materi', needs: 'kebutuhan', ideas: 'ide', bimbingan: 'bimbingan',
};

function describe(w: ImportWarning, i: number): PreviewWarning {
  const key = `${w.type}-${i}`;
  switch (w.type) {
    case 'rounded':
      return { key, text: `Nominal ${TABLE_LABEL[w.table] ?? w.table} ${w.from} dibulatkan menjadi ${formatRupiah(w.to)}.` };
    case 'suspicious_tx_date':
      return { key, fix: 'tx_date', ref: w.legacyId, text: `Transaksi ${formatRupiah(w.amount)}${w.note ? ` "${w.note.slice(0, 60)}"` : ''} bertanggal ${formatDateId(w.date, { day: 'numeric', month: 'long', year: 'numeric' })}. Tanggal ini jauh dari masa pemakaian app. Mungkin tahunnya salah.` };
    case 'semester_without_dates':
      return { key, fix: 'semester', ref: String(w.semester), text: `Semester ${w.semester} belum punya tanggal mulai dan selesai. Tanpa tanggal, jadwal kuliah tampil terus tanpa batas.` };
    case 'bill_without_account':
      return { key, fix: 'bill_account', ref: w.legacyId, text: `Tagihan "${w.name}" belum punya akun pembayaran.` };
    case 'missing_reference':
      return { key, text: `Data ${TABLE_LABEL[w.table] ?? w.table}: ${w.detail}.` };
    case 'invalid_value':
      return { key, text: `Nilai "${w.value}" pada ${TABLE_LABEL[w.table] ?? w.table} (${w.field}) tidak valid dan dikosongkan.` };
    case 'skipped':
      return { key, text: `Satu data ${TABLE_LABEL[w.table] ?? w.table} dilewati: ${w.reason}.` };
  }
}

async function prepare(text: string, rawOverrides: unknown): Promise<Fail | { result: TransformResult; backup: ReturnType<typeof legacyBackup.parse>; sha: string; overrides: ImportOverrides }> {
  await requireUser();
  let json: unknown;
  try { json = JSON.parse(text); } catch { return { ok: false, message: 'File bukan JSON yang valid.' }; }
  const parsed = legacyBackup.safeParse(json);
  if (!parsed.success) return { ok: false, message: 'File ini bukan cadangan Hub Pribadi versi lama (format tidak dikenali).' };
  const overrides = importOverrides.safeParse(rawOverrides ?? {});
  if (!overrides.success) return { ok: false, message: 'Pilihan perbaikan tidak valid.' };

  const supabase = await createClient();
  const boot = await supabase.rpc('bootstrap_user');
  if (boot.error) return { ok: false, message: 'Gagal menyiapkan data awal. Coba lagi.' };
  const [{ data: mapRows, error: e1 }, { data: cats, error: e2 }] = await Promise.all([
    supabase.from('legacy_id_map').select('source_table,legacy_id,new_id'),
    supabase.from('categories').select('id,slug').not('slug', 'is', null),
  ]);
  if (e1 || e2) return { ok: false, message: 'Gagal membaca data yang sudah ada.' };

  const result = transformLegacyBackup(
    parsed.data,
    {
      existingMap: new Map((mapRows ?? []).map((m) => [`${m.source_table}:${m.legacy_id}`, m.new_id as string])),
      categoryBySlug: new Map((cats ?? []).map((c) => [c.slug as string, c.id as string])),
    },
    overrides.data,
  );
  return { result, backup: parsed.data, sha: createHash('sha256').update(text).digest('hex'), overrides: overrides.data };
}

export async function previewImport(text: string, overrides: unknown): Promise<ImportPreview | Fail> {
  const p = await prepare(text, overrides);
  if ('ok' in p) return p;
  const { result, backup } = p;
  return {
    ok: true,
    exported: backup.exported ?? null,
    counts: result.counts,
    newRows: Object.values(result.payload.tables).reduce((n, rows) => n + rows.length, 0) + result.payload.category_updates.length,
    warnings: result.warnings.map(describe),
    blockers: result.blockers,
    semesters: result.semesters,
    accounts: result.accounts,
  };
}

export async function runImport(text: string, overrides: unknown): Promise<ImportOutcome | Fail> {
  const p = await prepare(text, overrides);
  if ('ok' in p) return p;
  const { result, backup, sha } = p;
  if (result.blockers.length) return { ok: false, message: result.blockers.join(' ') };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('import_legacy_backup', {
    payload: {
      ...result.payload,
      log: {
        exported_at: backup.exported ?? null,
        file_sha256: sha,
        summary: { counts: result.counts, warnings: result.warnings.length },
      },
    },
  });
  if (error) return { ok: false, message: `Impor gagal dan tidak ada data yang tersimpan. (${error.message})` };

  // Cocokkan saldo dengan perhitungan app lama.
  const { data: mapRows } = await supabase.from('legacy_id_map').select('legacy_id,new_id').eq('source_table', 'accounts');
  const { data: accounts } = await supabase.from('accounts').select('id,balance');
  const idByLegacy = new Map((mapRows ?? []).map((m) => [m.legacy_id as string, m.new_id as string]));
  const balById = new Map((accounts ?? []).map((a) => [a.id as string, a.balance as number]));
  revalidatePath('/', 'layout');
  return {
    ok: true,
    inserted: (data ?? {}) as Record<string, number>,
    balances: result.expectedBalances.map((b) => ({
      name: b.name, expected: b.balance, actual: balById.get(idByLegacy.get(b.legacyId) ?? '') ?? null,
    })),
  };
}
