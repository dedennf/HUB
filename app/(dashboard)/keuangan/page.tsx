import Link from 'next/link';
import type { Metadata } from 'next';
import { Empty, Money, PageTitle, Section, Tabs } from '@/components/ui';
import {
  db, getAccounts, getBills, getCategories, getDebts, getInvestments, getSavingsGoals, getSinkingFunds, getTransactionsInMonth,
} from '@/lib/data';
import { formatDateId, relativeDay, todayIso, zonedParts } from '@/lib/time';
import type { Account, Category, Transaction } from '@/lib/types';
import { AccountForm } from './AccountForm';
import { TransactionForm } from './TransactionForm';

export const metadata: Metadata = { title: 'Keuangan' };

const TABS = [
  { key: 'akun', label: 'Akun' },
  { key: 'transaksi', label: 'Transaksi' },
  { key: 'tagihan', label: 'Tagihan' },
  { key: 'utang', label: 'Utang & piutang' },
  { key: 'lainnya', label: 'Target & investasi' },
  { key: 'kategori', label: 'Kategori' },
];
const TYPE_LABEL: Record<Account['type'], string> = { bank: 'Rekening bank', ewallet: 'Dompet digital', cash: 'Uang tunai', investment: 'Akun investasi' };

function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export default async function KeuanganPage({ searchParams }: PageProps<'/keuangan'>) {
  const sp = await searchParams;
  const tab = typeof sp.tab === 'string' && TABS.some((t) => t.key === sp.tab) ? sp.tab : 'akun';
  const today = todayIso();
  const ym = typeof sp.bulan === 'string' && /^\d{4}-\d{2}$/.test(sp.bulan) ? sp.bulan : today.slice(0, 7);
  const s = await db();
  const [accounts, categories] = await Promise.all([getAccounts(s), getCategories(s)]);

  return (
    <>
      <PageTitle title="Keuangan" />
      <Tabs current={tab} items={TABS.map((t) => ({ ...t, href: `/keuangan?tab=${t.key}` }))} />
      {tab === 'akun' && <AccountsTab accounts={accounts} />}
      {tab === 'transaksi' && <TransactionsTab ym={ym} today={today} accounts={accounts} categories={categories} />}
      {tab === 'tagihan' && <BillsTab today={today} accounts={accounts} />}
      {tab === 'utang' && <DebtsTab />}
      {tab === 'lainnya' && <OthersTab />}
      {tab === 'kategori' && <CategoriesTab categories={categories} />}
    </>
  );
}

function AccountsTab({ accounts }: { accounts: Account[] }) {
  const active = accounts.filter((a) => !a.is_archived);
  const archived = accounts.filter((a) => a.is_archived);
  const total = active.reduce((n, a) => n + a.balance, 0);
  return (
    <div className="grid gap-4">
      <Section title="Saldo akun" action={<span className="text-sm text-muted">Total <Money value={total} className="font-semibold text-ink" /></span>}>
        {active.length ? (
          <div className="list">
            {active.map((a) => (
              <Link key={a.id} href={`/keuangan/akun/${a.id}`} className="row hover:text-accent">
                <span><span className="font-medium">{a.name}</span> <span className="text-xs text-muted">{TYPE_LABEL[a.type]}</span></span>
                <Money value={a.balance} signed className="font-semibold" />
              </Link>
            ))}
          </div>
        ) : <Empty>Belum ada akun.</Empty>}
      </Section>
      <Section title="Tambah akun"><AccountForm /></Section>
      {archived.length > 0 && (
        <Section title="Diarsipkan">
          <div className="list">
            {archived.map((a) => (
              <Link key={a.id} href={`/keuangan/akun/${a.id}`} className="row text-muted"><span>{a.name}</span><Money value={a.balance} /></Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

async function TransactionsTab({ ym, today, accounts, categories }: { ym: string; today: string; accounts: Account[]; categories: Category[] }) {
  const s = await db();
  const txs = await getTransactionsInMonth(s, ym);
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const cat = new Map(categories.map((c) => [c.id, c]));
  const income = txs.filter((t) => t.kind === 'income').reduce((n, t) => n + t.amount, 0);
  const expense = txs.filter((t) => t.kind === 'expense').reduce((n, t) => n + t.amount, 0);
  const byDay = new Map<string, Transaction[]>();
  for (const t of txs) {
    const d = zonedParts(t.occurred_at).date;
    byDay.set(d, [...(byDay.get(d) ?? []), t]);
  }
  const monthLabel = formatDateId(`${ym}-01`, { month: 'long', year: 'numeric' });
  return (
    <div className="grid gap-4">
      <Section title="Catat transaksi">
        <TransactionForm accounts={accounts} categories={categories} initial={{ kind: 'expense', date: today }} />
      </Section>
      <Section
        title={monthLabel}
        action={
          <div className="flex gap-2">
            <Link className="btn btn-sm" href={`/keuangan?tab=transaksi&bulan=${shiftMonth(ym, -1)}`}>‹ Sebelumnya</Link>
            <Link className="btn btn-sm" href={`/keuangan?tab=transaksi&bulan=${shiftMonth(ym, 1)}`}>Berikutnya ›</Link>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap gap-4 text-sm">
          <span>Masuk <Money value={income} className="font-semibold text-positive" /></span>
          <span>Keluar <Money value={expense} className="font-semibold text-danger" /></span>
          <span>Selisih <Money value={income - expense} signed className="font-semibold" /></span>
        </div>
        {txs.length === 0 && <Empty>Tidak ada transaksi di bulan ini.</Empty>}
        {[...byDay.entries()].map(([day, list]) => (
          <div key={day} className="mb-3">
            <div className="text-xs font-medium text-muted">{formatDateId(day, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            <div className="list">
              {list.map((t) => {
                const c = t.category_id ? cat.get(t.category_id) : null;
                const title = t.kind === 'transfer'
                  ? `${acc.get(t.account_id)} → ${acc.get(t.to_account_id ?? '')}`
                  : `${c ? `${c.icon ?? ''} ${c.name}` : 'Tanpa kategori'}`;
                return (
                  <Link key={t.id} href={`/keuangan/transaksi/${t.id}`} className="row hover:text-accent">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{title}</span>
                      <span className="block truncate text-xs text-muted">
                        {[t.kind !== 'transfer' ? acc.get(t.account_id) : 'Transfer', t.note].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <Money value={t.kind === 'expense' ? -t.amount : t.amount} signed={t.kind !== 'transfer'} className="shrink-0 font-semibold" />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}

async function BillsTab({ today, accounts }: { today: string; accounts: Account[] }) {
  const bills = await getBills(await db());
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const FREQ = { monthly: 'Bulanan', yearly: 'Tahunan', once: 'Sekali' } as const;
  return (
    <Section title="Tagihan">
      {bills.length ? (
        <div className="list">
          {bills.map((b) => (
            <div key={b.id} className={`row ${b.is_active ? '' : 'opacity-60'}`}>
              <span>
                <span className="block font-medium">{b.name}</span>
                <span className="block text-xs text-muted">
                  {FREQ[b.frequency]}
                  {b.next_due_date ? ` · ${formatDateId(b.next_due_date)} (${relativeDay(b.next_due_date, today)})` : ''}
                  {` · ${b.default_account_id ? acc.get(b.default_account_id) : 'akun belum diatur'}`}
                </span>
              </span>
              <Money value={b.amount} className="font-semibold" />
            </div>
          ))}
        </div>
      ) : <Empty>Belum ada tagihan.</Empty>}
      <p className="mt-2 text-xs text-muted">Menambah dan membayar tagihan dari layar ini hadir di Fase 1b.</p>
    </Section>
  );
}

async function DebtsTab() {
  const debts = await getDebts(await db());
  const rest = (d: { amount: number; paid_amount: number }) => d.amount - d.paid_amount;
  const groups = [
    { key: 'receivable', title: 'Piutang (orang lain berutang padamu)' },
    { key: 'payable', title: 'Utang' },
  ] as const;
  return (
    <div className="grid gap-4">
      {groups.map((g) => {
        const list = debts.filter((d) => d.direction === g.key);
        const total = list.reduce((n, d) => n + rest(d), 0);
        return (
          <Section key={g.key} title={g.title} action={<span className="text-sm text-muted">Sisa <Money value={total} className="font-semibold text-ink" /></span>}>
            {list.length ? (
              <div className="list">
                {list.map((d) => (
                  <div key={d.id} className="row">
                    <span>
                      <span className="block font-medium">{d.person}</span>
                      <span className="block text-xs text-muted">dibayar <Money value={d.paid_amount} /> dari <Money value={d.amount} />{d.due_on ? ` · jatuh tempo ${formatDateId(d.due_on)}` : ''}</span>
                    </span>
                    <Money value={rest(d)} className="font-semibold" />
                  </div>
                ))}
              </div>
            ) : <Empty>Tidak ada.</Empty>}
          </Section>
        );
      })}
    </div>
  );
}

async function OthersTab() {
  const s = await db();
  const [goals, sinking, investments] = await Promise.all([getSavingsGoals(s), getSinkingFunds(s), getInvestments(s)]);
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Section title="Target tabungan">
        {goals.length ? <div className="list">{goals.map((g) => (
          <div key={g.id} className="row"><span>{g.name}</span><span className="text-sm"><Money value={g.saved_amount} /> / <Money value={g.target_amount} /></span></div>
        ))}</div> : <Empty>Belum ada.</Empty>}
      </Section>
      <Section title="Biaya sejati">
        {sinking.length ? <div className="list">{sinking.map((f) => (
          <div key={f.id} className="row"><span>{f.name}{f.due_on ? <span className="block text-xs text-muted">{formatDateId(f.due_on)}</span> : null}</span><span className="text-sm"><Money value={f.saved_amount} /> / <Money value={f.amount} /></span></div>
        ))}</div> : <Empty>Belum ada.</Empty>}
      </Section>
      <Section title="Investasi">
        {investments.length ? <div className="list">{investments.map((v) => (
          <div key={v.id} className="row"><span>{v.name}<span className="block text-xs text-muted">{v.instrument}</span></span><Money value={v.current_value ?? 0} /></div>
        ))}</div> : <Empty>Belum ada.</Empty>}
      </Section>
    </div>
  );
}

function CategoriesTab({ categories }: { categories: Category[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(['expense', 'income'] as const).map((k) => (
        <Section key={k} title={k === 'expense' ? 'Kategori pengeluaran' : 'Kategori pemasukan'}>
          <div className="list">
            {categories.filter((c) => c.kind === k).map((c) => (
              <div key={c.id} className={`row ${c.is_hidden ? 'opacity-50' : ''}`}>
                <span>{c.icon} {c.name}{c.keywords.length ? <span className="block text-xs text-muted">{c.keywords.slice(0, 6).join(', ')}</span> : null}</span>
                {c.monthly_budget != null && <span className="text-xs text-muted">budget <Money value={c.monthly_budget} /></span>}
              </div>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}
