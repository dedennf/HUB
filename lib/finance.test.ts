import { describe, expect, it } from 'vitest';
import {
  accountChange, budgetLines, cashflow, daysLeftInMonth, netWorth, netWorthChangeThisMonth, readyMoney, readyMoneySeries, type TxLite,
} from './finance';
import type { Account, Category, Debt, Investment } from './types';

const acc = (id: string, type: Account['type'], balance: number, is_archived = false): Account =>
  ({ id, name: id, type, opening_balance: 0, balance, aliases: [], is_archived, sort_order: 0, account_number: null, account_holder: null, logo_domain: null });
const accounts = [acc('bank', 'bank', 1_000_000), acc('wallet', 'ewallet', 200_000), acc('rd', 'investment', 500_000), acc('old', 'cash', 99, true)];
const tx = (kind: TxLite['kind'], amount: number, account_id: string, date: string, to: string | null = null, category_id: string | null = null): TxLite =>
  ({ kind, amount, account_id, to_account_id: to, category_id, occurred_at: `${date}T05:00:00.000Z` });

describe('finance', () => {
  it('uang siap pakai tidak menghitung investasi dan akun arsip', () => {
    expect(readyMoney(accounts)).toBe(1_200_000);
  });

  it('kekayaan bersih: akun + investasi + piutang − utang', () => {
    const inv = [{ current_value: 300_000 } as Investment];
    const debts = [
      { direction: 'receivable', amount: 100_000, paid_amount: 40_000 } as Debt,
      { direction: 'payable', amount: 50_000, paid_amount: 0 } as Debt,
    ];
    expect(netWorth(accounts, inv, debts)).toBe(1_700_000 + 300_000 + 60_000 - 50_000);
  });

  it('perubahan bulan ini, transfer antar akun sendiri netral', () => {
    const month = [tx('income', 200_000, 'bank', '2026-11-02'), tx('transfer', 50_000, 'bank', '2026-11-03', 'wallet')];
    expect(netWorthChangeThisMonth(1_200_000, accounts, month)).toBeCloseTo(200_000 / 1_000_000);
    expect(netWorthChangeThisMonth(1_200_000, accounts, [])).toBeNull();
  });

  it('seri saldo siap pakai dihitung mundur', () => {
    const txs = [tx('expense', 100_000, 'bank', '2026-11-20'), tx('transfer', 300_000, 'bank', '2026-11-21', 'rd')];
    const s = readyMoneySeries(accounts, txs, '2026-11-19', '2026-11-21')!;
    expect(s).toEqual([
      { date: '2026-11-19', value: 1_600_000 },
      { date: '2026-11-20', value: 1_500_000 },
      { date: '2026-11-21', value: 1_200_000 },
    ]);
    expect(readyMoneySeries(accounts, [], '2026-11-01', '2026-11-21')).toBeNull();
  });

  it('perubahan per akun dan cashflow', () => {
    const month = [tx('income', 10, 'bank', '2026-11-01'), tx('expense', 3, 'bank', '2026-11-02'), tx('transfer', 2, 'bank', '2026-11-03', 'wallet')];
    expect(accountChange('bank', month)).toBe(5);
    expect(accountChange('wallet', month)).toBe(2);
    expect(cashflow(month)).toEqual({ income: 10, expense: 3, net: 7 });
  });

  it('budget: rasio terpakai dan sisa per hari', () => {
    const cats = [{ id: 'makan', monthly_budget: 800_000 } as Category, { id: 'lain', monthly_budget: null } as Category];
    const lines = budgetLines(cats, [tx('expense', 620_000, 'bank', '2026-11-10', null, 'makan')], 9);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ spent: 620_000, budget: 800_000, perDayLeft: 20_000 });
    expect(lines[0].ratio).toBeCloseTo(0.775);
    expect(daysLeftInMonth('2026-11-22')).toBe(9);
  });
});

describe('aman dibelanjakan hari ini', async () => {
  const { safeToSpend } = await import('./finance');
  const cat = (id: string, monthly_budget: number | null) => ({ id, slug: null, name: id, kind: 'expense' as const, icon: null, color: null, monthly_budget, keywords: [], subcategories: [], sort_order: 0, is_hidden: false });
  const t = (amount: number, category_id: string, date: string) => ({ kind: 'expense' as const, amount, account_id: 'a', to_account_id: null, category_id, occurred_at: `${date}T05:00:00Z` });
  const dateOf = (x: { occurred_at: string }) => x.occurred_at.slice(0, 10);
  it('sisa budget dibagi sisa hari, dikurangi belanja hari ini', () => {
    // 30 November: sisa 1 hari termasuk hari ini
    const r = safeToSpend([cat('makan', 1_500_000), cat('lain', null)], [t(1_000_000, 'makan', '2026-11-10'), t(50_000, 'makan', '2026-11-30'), t(999, 'lain', '2026-11-30')], '2026-11-30', dateOf);
    expect(r).toEqual({ perDay: 500_000, spentToday: 50_000, leftToday: 450_000, remaining: 450_000, budget: 1_500_000 });
  });
  it('tanpa budget: null, budget terlampaui: 0 per hari', () => {
    expect(safeToSpend([cat('lain', null)], [], '2026-11-15', dateOf)).toBeNull();
    expect(safeToSpend([cat('makan', 100)], [t(500, 'makan', '2026-11-01')], '2026-11-15', dateOf)!.perDay).toBe(0);
  });
});
