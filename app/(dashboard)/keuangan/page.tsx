import { ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AccountRow } from '@/components/ui/AccountRow';
import { Balance } from '@/components/ui/Balance';
import { CashflowCard } from '@/components/ui/CashflowCard';
import { PersonRow } from '@/components/ui/PersonRow';
import { PlanRow } from '@/components/ui/PlanRow';
import { AddButton, EmptyState, PageHeader, Section } from '@/components/ui/Section';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import {
  db, getAccounts, getBills, getCategories, getDebts, getInvestments, getSavingsGoals, getSinkingFunds, getTransactionsInMonth,
  getTransactionsSince,
} from '@/lib/data';
import { accountChange, budgetLines, cashflow, daysLeftInMonth } from '@/lib/finance';
import { formatDayMonth, formatDayShort, formatMonthYear, formatRp, formatRpShort } from '@/lib/format';
import { diffDays, todayIso, zonedParts } from '@/lib/time';
import type { Account, Category, Transaction } from '@/lib/types';
import { AccountForm } from './AccountForm';
import { TransactionForm } from './TransactionForm';

export const metadata: Metadata = { title: 'Uang' };

const TABS = [
  { key: 'ringkasan', label: 'Ringkasan' },
  { key: 'transaksi', label: 'Transaksi' },
  { key: 'rencana', label: 'Rencana' },
  { key: 'investasi', label: 'Investasi' },
];
/** Tab lama Fase 1a dialihkan ke tab baru. */
const LEGACY_TAB: Record<string, string> = { akun: 'ringkasan', tagihan: 'rencana', utang: 'rencana', lainnya: 'rencana' };

function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export default async function UangPage({ searchParams }: PageProps<'/keuangan'>) {
  const sp = await searchParams;
  const raw = typeof sp.tab === 'string' ? sp.tab : 'ringkasan';
  if (raw === 'kategori') redirect('/pengaturan/kategori');
  const tab = LEGACY_TAB[raw] ?? (TABS.some((t) => t.key === raw) ? raw : 'ringkasan');
  const today = todayIso();
  const ym = typeof sp.bulan === 'string' && /^\d{4}-\d{2}$/.test(sp.bulan) ? sp.bulan : today.slice(0, 7);
  const jenis = sp.jenis === 'transfer' || sp.jenis === 'income' ? sp.jenis : 'expense';
  const s = await db();
  const [accounts, categories] = await Promise.all([getAccounts(s), getCategories(s)]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Uang" />
      <SegmentedTabs label="Bagian Uang" current={tab} items={TABS.map((t) => ({ ...t, href: `/keuangan?tab=${t.key}` }))} />
      {tab === 'ringkasan' && <Ringkasan accounts={accounts} today={today} />}
      {tab === 'transaksi' && <Transaksi ym={ym} today={today} accounts={accounts} categories={categories} jenis={jenis} />}
      {tab === 'rencana' && <Rencana categories={categories} accounts={accounts} today={today} />}
      {tab === 'investasi' && <Investasi accounts={accounts} />}
    </div>
  );
}

async function Ringkasan({ accounts, today }: { accounts: Account[]; today: string }) {
  const s = await db();
  const [monthTxs, goals, sinking, debts] = await Promise.all([
    getTransactionsSince(s, `${today.slice(0, 7)}-01`), getSavingsGoals(s), getSinkingFunds(s), getDebts(s),
  ]);
  const flow = cashflow(monthTxs);
  const active = accounts.filter((a) => !a.is_archived);
  const archived = accounts.filter((a) => a.is_archived);
  const receivables = debts.filter((d) => d.direction === 'receivable' && d.amount > d.paid_amount).length;
  const planParts = [
    goals.length ? `${goals.length} target tabungan` : '',
    sinking.filter((f) => !f.is_done).length ? `${sinking.filter((f) => !f.is_done).length} biaya sejati` : '',
    receivables ? `${receivables} piutang` : '',
  ].filter(Boolean);
  return (
    <>
      <CashflowCard monthLabel={formatMonthYear(today).split(' ')[0]} income={flow.income} expense={flow.expense} daysLeft={daysLeftInMonth(today)} />
      <Section title="Akun saya" action={active.length ? <Link href="/keuangan/cocokkan" className="btn">Cocokkan saldo</Link> : undefined}>
        {active.length ? (
          <div className="card rows overflow-hidden">
            {active.map((a) => <AccountRow key={a.id} account={a} change={accountChange(a.id, monthTxs)} href={`/keuangan/akun/${a.id}`} />)}
          </div>
        ) : <div className="card"><EmptyState>Belum ada akun. Tambahkan di bawah atau impor data lama.</EmptyState></div>}
        <p className="mt-2 px-1 text-[12px] text-muted">Perubahan dihitung sejak awal bulan.</p>
      </Section>
      <Link href="/keuangan?tab=rencana" className="card flex min-h-[64px] items-center gap-3 p-4 hover:ring-1 hover:ring-accent">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">Rencana keuangan</span>
          <span className="block text-[12px] text-muted">{planParts.join(' · ') || 'Budget, target tabungan, tagihan, dan piutang'}</span>
        </span>
        <ChevronRight size={18} strokeWidth={1.8} className="text-muted" aria-hidden="true" />
      </Link>
      <details className="card p-4">
        <summary className="flex min-h-11 cursor-pointer items-center text-[14px] font-semibold">Tambah akun</summary>
        <div className="pt-3"><AccountForm /></div>
      </details>
      {archived.length > 0 && (
        <Section title="Diarsipkan">
          <div className="card rows overflow-hidden opacity-80">
            {archived.map((a) => <AccountRow key={a.id} account={a} change={0} href={`/keuangan/akun/${a.id}`} />)}
          </div>
        </Section>
      )}
    </>
  );
}

async function Transaksi({ ym, today, accounts, categories, jenis }: { ym: string; today: string; accounts: Account[]; categories: Category[]; jenis: 'expense' | 'income' | 'transfer' }) {
  const txs = await getTransactionsInMonth(await db(), ym);
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const cat = new Map(categories.map((c) => [c.id, c]));
  const flow = cashflow(txs);
  const byDay = new Map<string, Transaction[]>();
  for (const t of txs) {
    const d = zonedParts(t.occurred_at).date;
    byDay.set(d, [...(byDay.get(d) ?? []), t]);
  }
  return (
    <>
      <section id="catat" className="card scroll-mt-4 p-4" aria-label="Catat transaksi">
        <h2 className="h-section mb-3">Catat transaksi</h2>
        <TransactionForm accounts={accounts} categories={categories} initial={{ kind: jenis, date: today }} />
      </section>
      <Section title={formatMonthYear(`${ym}-01`)} action={
        <span className="flex gap-1">
          <Link className="btn px-3" href={`/keuangan?tab=transaksi&bulan=${shiftMonth(ym, -1)}`} aria-label="Bulan sebelumnya">‹</Link>
          <Link className="btn px-3" href={`/keuangan?tab=transaksi&bulan=${shiftMonth(ym, 1)}`} aria-label="Bulan berikutnya">›</Link>
        </span>
      }>
        <p className="mb-2 px-1 text-[13px] text-muted">
          Masuk <span className="num font-semibold text-positive">{formatRp(flow.income)}</span> · Keluar <span className="num font-semibold text-negative">{formatRp(flow.expense)}</span>
        </p>
        {txs.length === 0 ? <div className="card"><EmptyState>Tidak ada transaksi di bulan ini.</EmptyState></div> : (
          <div className="flex flex-col gap-3">
            {[...byDay.entries()].map(([day, list]) => (
              <div key={day}>
                <p className="mb-1.5 px-1 text-[12px] font-semibold text-muted">{formatDayShort(day)}</p>
                <div className="card rows overflow-hidden">
                  {list.map((t) => {
                    const c = t.category_id ? cat.get(t.category_id) : null;
                    const title = t.kind === 'transfer' ? `${acc.get(t.account_id)} → ${acc.get(t.to_account_id ?? '')}` : c?.name ?? 'Tanpa kategori';
                    const sign = t.kind === 'expense' ? '−' : t.kind === 'income' ? '+' : '';
                    return (
                      <Link key={t.id} href={`/keuangan/transaksi/${t.id}`} className="flex min-h-[56px] items-center gap-3 px-4 py-2.5 hover:bg-bg">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold">{title}</span>
                          <span className="block truncate text-[12px] text-muted">{[t.kind === 'transfer' ? 'Transfer' : acc.get(t.account_id), t.note].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className={`num shrink-0 text-[14px] font-bold ${t.kind === 'expense' ? 'text-negative' : t.kind === 'income' ? 'text-positive' : ''}`}>
                          {sign}{formatRp(t.amount)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

async function Rencana({ categories, accounts, today }: { categories: Category[]; accounts: Account[]; today: string }) {
  const s = await db();
  const [monthTxs, goals, sinking, debts, bills] = await Promise.all([
    getTransactionsSince(s, `${today.slice(0, 7)}-01`), getSavingsGoals(s), getSinkingFunds(s), getDebts(s), getBills(s),
  ]);
  const budgets = budgetLines(categories, monthTxs, daysLeftInMonth(today));
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const receivable = debts.filter((d) => d.direction === 'receivable' && d.amount > d.paid_amount);
  const payable = debts.filter((d) => d.direction === 'payable' && d.amount > d.paid_amount);
  const plans = [
    ...goals.map((g) => ({ id: g.id, href: `/catat/tabungan/${g.id}`, title: g.name, ratio: g.target_amount ? g.saved_amount / g.target_amount : 0,
      detail: `${formatRpShort(g.saved_amount)} dari ${formatRpShort(g.target_amount)}${g.deadline ? ` · tenggat ${formatDayMonth(g.deadline)}` : ''}` })),
    ...sinking.filter((f) => !f.is_done).map((f) => {
      const months = f.due_on ? Math.max(1, Math.ceil(diffDays(f.due_on, today) / 30)) : 1;
      const perMonth = Math.ceil(Math.max(0, f.amount - f.saved_amount) / months);
      return { id: f.id, href: `/catat/biaya-sejati/${f.id}`, title: f.name, ratio: f.amount ? f.saved_amount / f.amount : 0, detail: `Sisihkan ${formatRpShort(perMonth)}/bulan` };
    }),
  ];
  const activeBills = bills.filter((b) => b.is_active);
  const debtDetail = (d: { occurred_on: string | null; due_on: string | null; paid_amount: number }) =>
    [d.occurred_on ? `Sejak ${formatDayMonth(d.occurred_on)}` : '', d.paid_amount > 0 ? `sudah dibayar ${formatRpShort(d.paid_amount)}` : '', d.due_on ? `tenggat ${formatDayMonth(d.due_on)}` : ''].filter(Boolean).join(' · ') || 'Belum ada cicilan';

  return (
    <>
      <Section title={`Budget ${formatMonthYear(today).split(' ')[0]}`} action={<Link href="/pengaturan/kategori" className="btn">Atur budget</Link>}>
        {budgets.length ? (
          <div className="card rows overflow-hidden">
            {budgets.map((b) => (
              <PlanRow key={b.category.id} kind="budget" title={b.category.name} ratio={b.ratio} href={`/catat/kategori/${b.category.id}?kembali=/keuangan?tab=rencana`}
                detail={`${formatRpShort(b.spent)} dari ${formatRpShort(b.budget)}${b.perDayLeft != null ? ` · sisa ${formatRpShort(b.perDayLeft)}/hari` : ''}`} />
            ))}
          </div>
        ) : <div className="card"><EmptyState>Belum ada budget. Atur budget per kategori di Pengaturan, Kategori dan budget.</EmptyState></div>}
      </Section>
      <Section title="Target tabungan & biaya sejati" action={
        <span className="flex gap-1">
          <AddButton href="/catat/tabungan" label="Tambah target tabungan" />
          <Link href="/catat/biaya-sejati" className="btn">+ Biaya sejati</Link>
        </span>
      }>
        {plans.length ? <div className="card rows overflow-hidden">{plans.map((p) => <PlanRow key={p.id} kind="goal" title={p.title} detail={p.detail} ratio={p.ratio} href={p.href} />)}</div>
          : <div className="card"><EmptyState>Belum ada target tabungan atau biaya sejati.</EmptyState></div>}
      </Section>
      <Section title="Tagihan" add={{ href: '/catat/tagihan', label: 'Tambah tagihan' }}>
        {activeBills.length ? (
          <div className="card rows overflow-hidden">
            {activeBills.map((b) => {
              const d = b.next_due_date ? diffDays(b.next_due_date, today) : null;
              const when = d == null ? '' : d < 0 ? `lewat ${-d} hari` : d === 0 ? 'hari ini' : `${d} hari lagi`;
              return (
                <div key={b.id} className="flex min-h-[56px] items-center gap-2 py-1 pl-4 pr-2">
                  <Link href={`/catat/tagihan/${b.id}`} className="min-w-0 flex-1 py-1.5 hover:text-accent">
                    <span className="block text-[14px] font-semibold">{b.name}</span>
                    <span className={`block text-[12px] ${d != null && d < 0 ? 'text-negative' : 'text-muted'}`}>
                      {[b.next_due_date ? `${formatDayMonth(b.next_due_date)} · ${when}` : '', b.default_account_id ? acc.get(b.default_account_id) : 'akun belum diatur'].filter(Boolean).join(' · ')}
                    </span>
                  </Link>
                  <span className="num text-[14px] font-bold">{formatRp(b.amount)}</span>
                  <Link href={`/keuangan/tagihan/${b.id}/bayar`} className="inline-flex min-h-11 items-center rounded-[10px] border border-line px-3 text-[12px] font-semibold text-accent">Bayar</Link>
                </div>
              );
            })}
          </div>
        ) : <div className="card"><EmptyState>Belum ada tagihan.</EmptyState></div>}
      </Section>
      <Section title={`Piutang · ${receivable.length} orang`} add={{ href: '/catat/utang', label: 'Tambah utang atau piutang' }}>
        <div className="card rows overflow-hidden">
          {receivable.length ? receivable.map((d) => <PersonRow key={d.id} name={d.person} detail={debtDetail(d)} amount={d.amount - d.paid_amount} href={`/catat/utang/${d.id}`} action={{ href: `/keuangan/utang/${d.id}/bayar`, label: 'Terima' }} />)
            : <EmptyState>Tidak ada piutang.</EmptyState>}
          {payable.length ? payable.map((d) => <PersonRow key={d.id} name={d.person} detail={`Utang · ${debtDetail(d)}`} amount={d.amount - d.paid_amount} href={`/catat/utang/${d.id}`} action={{ href: `/keuangan/utang/${d.id}/bayar`, label: 'Bayar' }} />)
            : <p className="px-4 py-3 text-[12px] text-muted">Utang: tidak ada</p>}
        </div>
      </Section>
    </>
  );
}

async function Investasi({ accounts }: { accounts: Account[] }) {
  const investments = await getInvestments(await db());
  const invAccounts = accounts.filter((a) => a.type === 'investment' && !a.is_archived);
  const total = investments.reduce((n, v) => n + (v.current_value ?? 0), 0) + invAccounts.reduce((n, a) => n + a.balance, 0);
  return (
    <>
      <section className="card p-4">
        <p className="text-[13px] text-muted">Total investasi (tidak siap pakai)</p>
        <p className="font-display text-[24px] font-extrabold"><Balance value={total} /></p>
      </section>
      <Section title="Akun investasi">
        {invAccounts.length ? <div className="card rows overflow-hidden">{invAccounts.map((a) => <Link key={a.id} href={`/keuangan/akun/${a.id}`} className="flex min-h-[56px] items-center justify-between px-4 hover:bg-bg"><span className="text-[14px] font-semibold">{a.name}</span><Balance value={a.balance} className="text-[14px] font-bold" /></Link>)}</div>
          : <div className="card"><EmptyState>Belum ada akun investasi.</EmptyState></div>}
      </Section>
      <Section title="Instrumen" add={{ href: '/catat/investasi', label: 'Tambah investasi' }}>
        {investments.length ? (
          <div className="card rows overflow-hidden">
            {investments.map((v) => {
              const gain = v.invested_amount ? ((v.current_value ?? 0) - v.invested_amount) / v.invested_amount : null;
              return (
                <Link key={v.id} href={`/catat/investasi/${v.id}`} className="flex min-h-[56px] items-center gap-3 px-4 py-2.5 hover:bg-bg">
                  <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold">{v.name}</span><span className="block text-[12px] text-muted">{[v.instrument, v.platform].filter(Boolean).join(' · ')}</span></span>
                  <span className="text-right"><Balance value={v.current_value ?? 0} className="block text-[14px] font-bold" />{gain != null && <span className={`num block text-[12px] font-semibold ${gain >= 0 ? 'text-positive' : 'text-negative'}`}>{gain >= 0 ? '▲' : '▼'} {Math.abs(Math.round(gain * 1000) / 10).toString().replace('.', ',')}%</span>}</span>
                </Link>
              );
            })}
          </div>
        ) : <div className="card"><EmptyState>Belum ada instrumen investasi.</EmptyState></div>}
      </Section>
    </>
  );
}

