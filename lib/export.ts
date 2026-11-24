// Ekspor cadangan Kompas (Fase 1c). Hanya tabel data pengguna, tanpa kolom user_id.
export const EXPORT_TABLES = [
  'accounts', 'categories', 'transactions', 'investments', 'bills', 'savings_goals', 'debts', 'sinking_funds',
  'semesters', 'courses', 'course_schedules', 'materials', 'tasks', 'task_work_slots', 'holidays',
  'research_projects', 'research_needs', 'research_targets', 'research_ideas', 'readings', 'supervisions',
  'events', 'settings', 'agent_memory', 'automations', 'vocab', 'vocab_reviews', 'writing_submissions', 'mistake_patterns', 'practice_sessions',
] as const;

type Row = Record<string, unknown>;

export function stripUser(rows: Row[]): Row[] {
  return rows.map(({ user_id: _u, ...rest }) => { void _u; return rest; });
}

const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** CSV transaksi: kolom berbahasa Indonesia, nominal integer, waktu WIB. BOM agar Excel membaca UTF-8. */
export function transactionsCsv(
  txs: { occurred_at: string; kind: string; amount: number; account_id: string; to_account_id: string | null; category_id: string | null; subcategory: string | null; note: string | null; source: string }[],
  accountName: Map<string, string>,
  categoryName: Map<string, string>,
  toLocal: (iso: string) => { date: string; time: string },
): string {
  const KIND: Record<string, string> = { expense: 'keluar', income: 'masuk', transfer: 'transfer' };
  const head = ['tanggal', 'jam', 'jenis', 'nominal', 'akun', 'ke_akun', 'kategori', 'sub_kategori', 'catatan', 'sumber'];
  const lines = txs.map((t) => {
    const { date, time } = toLocal(t.occurred_at);
    return [date, time, KIND[t.kind] ?? t.kind, t.amount, q(accountName.get(t.account_id)), q(t.to_account_id ? accountName.get(t.to_account_id) : ''),
      q(t.category_id ? categoryName.get(t.category_id) : ''), q(t.subcategory), q(t.note), t.source].join(',');
  });
  return '﻿' + [head.join(','), ...lines].join('\n');
}
