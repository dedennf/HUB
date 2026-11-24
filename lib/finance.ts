// Ringkasan keuangan untuk Beranda dan Uang (D-27). Fungsi murni, diuji di finance.test.ts.
import { addDays, zonedParts } from './time';
import type { Account, Category, Debt, Investment } from './types';

export type TxLite = {
  kind: 'expense' | 'income' | 'transfer';
  amount: number;
  account_id: string;
  to_account_id: string | null;
  category_id?: string | null;
  occurred_at: string;
};

export const isReady = (a: Pick<Account, 'type' | 'is_archived'>) => !a.is_archived && a.type !== 'investment';

/** Uang siap pakai: saldo semua akun aktif selain akun investasi. */
export function readyMoney(accounts: Account[]): number {
  return accounts.filter(isReady).reduce((n, a) => n + a.balance, 0);
}

/** Kekayaan bersih: semua akun aktif + nilai investasi + sisa piutang − sisa utang. */
export function netWorth(accounts: Account[], investments: Investment[], debts: Debt[]): number {
  const acc = accounts.filter((a) => !a.is_archived).reduce((n, a) => n + a.balance, 0);
  const inv = investments.reduce((n, v) => n + (v.current_value ?? 0), 0);
  const debt = debts.reduce((n, d) => n + (d.direction === 'receivable' ? 1 : -1) * Math.max(0, d.amount - d.paid_amount), 0);
  return acc + inv + debt;
}

/** Pengaruh satu transaksi pada total sekelompok akun. */
export function effectOn(tx: TxLite, inGroup: (accountId: string) => boolean): number {
  if (tx.kind === 'income') return inGroup(tx.account_id) ? tx.amount : 0;
  if (tx.kind === 'expense') return inGroup(tx.account_id) ? -tx.amount : 0;
  return (inGroup(tx.to_account_id ?? '') ? tx.amount : 0) - (inGroup(tx.account_id) ? tx.amount : 0);
}

/**
 * Perubahan kekayaan bersih sejak awal bulan, dalam rasio (0.038 = 3,8%).
 * Hanya arus di akun yang diketahui, nilai investasi dan utang dianggap tetap sepanjang bulan.
 * null jika belum ada transaksi bulan ini atau basisnya nol/negatif.
 */
export function netWorthChangeThisMonth(nowNetWorth: number, accounts: Account[], monthTxs: TxLite[]): number | null {
  const active = new Set(accounts.filter((a) => !a.is_archived).map((a) => a.id));
  if (!monthTxs.length) return null;
  const delta = monthTxs.reduce((n, t) => n + effectOn(t, (id) => active.has(id)), 0);
  const start = nowNetWorth - delta;
  if (start <= 0 || delta === 0) return null;
  return delta / start;
}

export type SeriesPoint = { date: string; value: number };

/**
 * Saldo uang siap pakai per hari, dihitung mundur dari saldo sekarang.
 * txs: transaksi sejak `from` (boleh lebih), urutan bebas.
 * Mengembalikan null jika tidak ada transaksi di rentang itu (grafik tidak ditampilkan, D-27).
 */
export function readyMoneySeries(accounts: Account[], txs: TxLite[], from: string, to: string): SeriesPoint[] | null {
  const ready = new Set(accounts.filter(isReady).map((a) => a.id));
  const inRange = txs.filter((t) => zonedParts(t.occurred_at).date >= from);
  if (!inRange.some((t) => effectOn(t, (id) => ready.has(id)) !== 0)) return null;
  const byDay = new Map<string, number>();
  for (const t of inRange) {
    const d = zonedParts(t.occurred_at).date;
    byDay.set(d, (byDay.get(d) ?? 0) + effectOn(t, (id) => ready.has(id)));
  }
  let value = readyMoney(accounts);
  // transaksi setelah `to` (mis. bertanggal masa depan) dikeluarkan dulu
  for (const [d, v] of byDay) if (d > to) value -= v;
  const out: SeriesPoint[] = [];
  for (let d = to; d >= from; d = addDays(d, -1)) {
    out.push({ date: d, value });
    value -= byDay.get(d) ?? 0;
  }
  return out.reverse();
}

export const RANGES = [
  { key: '1B', label: '1B', days: 30, name: '1 bulan' },
  { key: '3B', label: '3B', days: 90, name: '3 bulan' },
  { key: '6B', label: '6B', days: 180, name: '6 bulan' },
  { key: '1T', label: '1T', days: 365, name: '1 tahun' },
] as const;
export type RangeKey = (typeof RANGES)[number]['key'];

/** Perubahan saldo satu akun dalam kumpulan transaksi (mis. bulan ini). */
export function accountChange(accountId: string, txs: TxLite[]): number {
  return txs.reduce((n, t) => n + effectOn(t, (id) => id === accountId), 0);
}

/** Cashflow: pemasukan dan pengeluaran (transfer tidak dihitung). */
export function cashflow(txs: TxLite[]): { income: number; expense: number; net: number } {
  const income = txs.filter((t) => t.kind === 'income').reduce((n, t) => n + t.amount, 0);
  const expense = txs.filter((t) => t.kind === 'expense').reduce((n, t) => n + t.amount, 0);
  return { income, expense, net: income - expense };
}

export type BudgetLine = { category: Category; spent: number; budget: number; ratio: number; perDayLeft: number | null };

/** Budget bulanan per kategori yang punya monthly_budget. daysLeft termasuk hari ini. */
export function budgetLines(categories: Category[], monthTxs: TxLite[], daysLeft: number): BudgetLine[] {
  const spent = new Map<string, number>();
  for (const t of monthTxs) if (t.kind === 'expense' && t.category_id) spent.set(t.category_id, (spent.get(t.category_id) ?? 0) + t.amount);
  return categories
    .filter((c) => c.monthly_budget != null && c.monthly_budget > 0)
    .map((c) => {
      const s = spent.get(c.id) ?? 0;
      const b = c.monthly_budget!;
      const left = b - s;
      return { category: c, spent: s, budget: b, ratio: s / b, perDayLeft: daysLeft > 0 && left > 0 ? Math.floor(left / daysLeft) : null };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/** Jumlah hari tersisa di bulan `ym` termasuk `today`. */
export function daysLeftInMonth(today: string): number {
  const [y, m, d] = today.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return last - d + 1;
}
