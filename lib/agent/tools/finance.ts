// Tools keuangan (SPEC 6.8).
import { z } from 'zod';
import { addDays, zonedParts, zonedToIso } from '../../time';
import { normalize, resolveAccount, resolveCategory, resolveInvestment } from '../resolve';
import { dateStr, deleteRow, insertRow, isErr, money, pick, rp, toIso, updateRow, when } from './common';
import { fail, type ReadTool, type ToolCtx, type UndoOp, type WriteTool } from './types';

const KIND_LABEL = { expense: 'Pengeluaran', income: 'Pemasukan', transfer: 'Transfer' } as const;

async function accountNames(ctx: ToolCtx) {
  const { data } = await ctx.db.from('accounts').select('id,name');
  return new Map((data ?? []).map((a) => [a.id as string, a.name as string]));
}
async function categoryNames(ctx: ToolCtx) {
  const { data } = await ctx.db.from('categories').select('id,name');
  return new Map((data ?? []).map((c) => [c.id as string, c.name as string]));
}

/** Aturan merchant dari memori agen, mis. "Indomaret" → Kebutuhan harian. */
/** Memori yang kuncinya muncul sebagai kata utuh di teks merchant atau catatan (SPEC 7.2, koreksi pengguna). */
async function memoryFor(ctx: ToolCtx, kind: 'merchant_rule' | 'correction', field: string, texts: (string | null | undefined)[]): Promise<string | null> {
  const hay = texts.filter(Boolean).map((t) => ` ${normalize(String(t))} `);
  if (!hay.length) return null;
  const { data } = await ctx.db.from('agent_memory').select('key,value,confidence').eq('kind', kind).order('confidence', { ascending: false });
  for (const m of data ?? []) {
    const k = normalize(String(m.key));
    const v = m.value && typeof m.value === 'object' ? (m.value as Record<string, unknown>)[field] : null;
    if (k && typeof v === 'string' && hay.some((h) => h.includes(` ${k} `))) return v;
  }
  return null;
}

async function merchantRule(ctx: ToolCtx, texts: (string | null | undefined)[]): Promise<{ id: string; label: string } | null> {
  const id = await memoryFor(ctx, 'merchant_rule', 'category_id', texts);
  if (!id) return null;
  const { data: c } = await ctx.db.from('categories').select('id,name').eq('id', id).maybeSingle();
  return c ? { id: c.id, label: c.name } : null;
}

/** Akun yang paling sering dipakai untuk kategori itu (SPEC 6.5 aturan data tidak jelas). */
async function mostUsedAccount(ctx: ToolCtx, categoryId: string | null): Promise<string | null> {
  let q = ctx.db.from('transactions').select('account_id').neq('kind', 'transfer').order('occurred_at', { ascending: false }).limit(200);
  if (categoryId) q = q.eq('category_id', categoryId);
  const { data } = await q;
  const count = new Map<string, number>();
  for (const t of data ?? []) count.set(t.account_id, (count.get(t.account_id) ?? 0) + 1);
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (best) return best;
  if (categoryId) return mostUsedAccount(ctx, null);
  const { data: first } = await ctx.db.from('accounts').select('id').eq('is_archived', false).neq('type', 'investment').order('sort_order').limit(1).maybeSingle();
  return first?.id ?? null;
}

/* ---------------- baca ---------------- */

export const getBalances: ReadTool<z.ZodObject<{ account_ids: z.ZodOptional<z.ZodArray<z.ZodString>> }>> = {
  name: 'get_balances', module: 'finance', permission: 'read',
  description: 'Lihat saldo akun (bank, dompet digital, tunai, investasi) beserta total uang siap pakai. Kosongkan account_ids untuk semua akun. Nama akun atau alias boleh dipakai.',
  parameters: z.object({ account_ids: z.array(z.string()).optional().describe('Nama, alias, atau id akun. Kosong = semua.') }),
  async run(ctx, { account_ids }) {
    const { data } = await ctx.db.from('accounts').select('id,name,type,balance,aliases').eq('is_archived', false).order('sort_order');
    let list = data ?? [];
    if (account_ids?.length) {
      const ids: string[] = [];
      for (const q of account_ids) {
        const r = pick(await resolveAccount(ctx.db, q), 'account_ids', 'akun', q);
        if (isErr(r)) return r;
        ids.push(r.id);
      }
      list = list.filter((a) => ids.includes(a.id));
    }
    const ready = (data ?? []).filter((a) => a.type !== 'investment').reduce((n, a) => n + a.balance, 0);
    return { ok: true, data: { accounts: list.map((a) => ({ id: a.id, name: a.name, type: a.type, balance: a.balance })), ready_money: ready } };
  },
};

const searchParams = z.object({
  from: dateStr('Mulai tanggal').optional(),
  to: dateStr('Sampai tanggal').optional(),
  kind: z.enum(['expense', 'income', 'transfer']).optional(),
  category: z.string().optional().describe('Nama kategori'),
  account: z.string().optional().describe('Nama atau alias akun'),
  query: z.string().max(80).optional().describe('Kata di catatan atau merchant'),
  limit: z.number().int().min(1).max(50).optional().describe('Maksimal baris, bawaan 20'),
});
export const searchTransactions: ReadTool<typeof searchParams> = {
  name: 'search_transactions', module: 'finance', permission: 'read',
  description: 'Cari transaksi berdasarkan rentang tanggal, jenis, kategori, akun, atau kata di catatan. Hasil terbaru dulu.',
  parameters: searchParams,
  async run(ctx, a) {
    let q = ctx.db.from('transactions').select('id,kind,amount,account_id,to_account_id,category_id,note,merchant,occurred_at').order('occurred_at', { ascending: false }).limit(a.limit ?? 20);
    if (a.from) q = q.gte('occurred_at', zonedToIso(a.from));
    if (a.to) q = q.lt('occurred_at', zonedToIso(addDays(a.to, 1)));
    if (a.kind) q = q.eq('kind', a.kind);
    if (a.account) {
      const r = pick(await resolveAccount(ctx.db, a.account), 'account', 'akun', a.account);
      if (isErr(r)) return r;
      q = q.or(`account_id.eq.${r.id},to_account_id.eq.${r.id}`);
    }
    if (a.category) {
      const r = pick(await resolveCategory(ctx.db, a.category, a.kind === 'income' ? 'income' : 'expense'), 'category', 'kategori', a.category);
      if (isErr(r)) return r;
      q = q.eq('category_id', r.id);
    }
    if (a.query) q = q.or(`note.ilike.%${a.query.replace(/[%,()]/g, '')}%,merchant.ilike.%${a.query.replace(/[%,()]/g, '')}%`);
    const [{ data, error }, acc, cat] = await Promise.all([q, accountNames(ctx), categoryNames(ctx)]);
    if (error) return fail(error.message);
    return {
      ok: true,
      data: (data ?? []).map((t) => ({
        id: t.id, kind: t.kind, amount: t.amount, date: zonedParts(t.occurred_at).date, account: acc.get(t.account_id),
        to_account: t.to_account_id ? acc.get(t.to_account_id) : undefined, category: t.category_id ? cat.get(t.category_id) : undefined,
        note: t.note ?? undefined, merchant: t.merchant ?? undefined,
      })),
    };
  },
};

const summaryParams = z.object({
  period: z.enum(['week', 'month', 'custom']).describe('week = Senin sampai hari ini, month = bulan berjalan'),
  from: dateStr('Mulai (untuk custom)').optional(),
  to: dateStr('Sampai (untuk custom)').optional(),
  group_by: z.enum(['category', 'account', 'day']),
});
export const spendingSummary: ReadTool<typeof summaryParams> = {
  name: 'spending_summary', module: 'finance', permission: 'read',
  description: 'Ringkasan pemasukan dan pengeluaran dalam periode, dikelompokkan per kategori, akun, atau hari, beserta budget bulanan per kategori.',
  parameters: summaryParams,
  async run(ctx, a) {
    let from = a.from ?? ctx.today;
    let to = a.to ?? ctx.today;
    if (a.period === 'month') { from = `${ctx.today.slice(0, 7)}-01`; to = ctx.today; }
    if (a.period === 'week') { const wd = new Date(`${ctx.today}T12:00:00Z`).getUTCDay() || 7; from = addDays(ctx.today, 1 - wd); to = ctx.today; }
    if (a.period === 'custom' && (!a.from || !a.to)) return fail('Periode custom butuh from dan to.');
    const [{ data }, acc, { data: cats }] = await Promise.all([
      ctx.db.from('transactions').select('kind,amount,account_id,category_id,occurred_at').neq('kind', 'transfer').gte('occurred_at', zonedToIso(from)).lt('occurred_at', zonedToIso(addDays(to, 1))),
      accountNames(ctx), ctx.db.from('categories').select('id,name,monthly_budget'),
    ]);
    const catMap = new Map((cats ?? []).map((c) => [c.id as string, c]));
    const groups = new Map<string, { income: number; expense: number }>();
    for (const t of data ?? []) {
      const key = a.group_by === 'account' ? acc.get(t.account_id) ?? '?' : a.group_by === 'day' ? zonedParts(t.occurred_at).date : (t.category_id ? catMap.get(t.category_id)?.name : null) ?? 'Tanpa kategori';
      const g = groups.get(key) ?? { income: 0, expense: 0 };
      g[t.kind as 'income' | 'expense'] += t.amount;
      groups.set(key, g);
    }
    const budgets = (cats ?? []).filter((c) => c.monthly_budget).map((c) => ({ category: c.name, monthly_budget: c.monthly_budget }));
    const totals = [...groups.values()].reduce((n, g) => ({ income: n.income + g.income, expense: n.expense + g.expense }), { income: 0, expense: 0 });
    return { ok: true, data: { from, to, totals, groups: Object.fromEntries(groups), budgets } };
  },
};

export const getBills: ReadTool<z.ZodObject<{ within_days: z.ZodOptional<z.ZodNumber> }>> = {
  name: 'get_bills', module: 'finance', permission: 'read',
  description: 'Daftar tagihan aktif yang jatuh tempo dalam N hari ke depan (termasuk yang sudah lewat).',
  parameters: z.object({ within_days: z.number().int().min(0).max(366).optional().describe('Bawaan 30') }),
  async run(ctx, { within_days }) {
    const [{ data }, acc] = await Promise.all([
      ctx.db.from('bills').select('id,name,amount,frequency,next_due_date,default_account_id').eq('is_active', true).lte('next_due_date', addDays(ctx.today, within_days ?? 30)).order('next_due_date'),
      accountNames(ctx),
    ]);
    return { ok: true, data: (data ?? []).map((b) => ({ ...b, default_account: b.default_account_id ? acc.get(b.default_account_id) : null, overdue: b.next_due_date < ctx.today })) };
  },
};

/* ---------------- tulis ---------------- */

const txParams = z.object({
  kind: z.enum(['expense', 'income']).describe('expense = pengeluaran, income = pemasukan. Transfer antar akun sendiri pakai add_transfer.'),
  amount: money('Nominal'),
  account: z.string().optional().describe('Nama atau alias akun. Kosong = akun yang paling sering dipakai untuk kategori itu (akan ditandai).'),
  category: z.string().optional().describe('Nama kategori, kosong = tebak dari merchant/catatan'),
  merchant: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
  occurred_at: when('Waktu transaksi, kosong = sekarang').optional(),
  receipt_id: z.uuid().optional(),
});
type TxResolved = { kind: 'expense' | 'income'; amount: number; account_id: string; category_id: string | null; merchant: string | null; note: string | null; occurred_at: string; receipt_id: string | null; source: string };

export const addTransaction: WriteTool<typeof txParams, TxResolved> = {
  name: 'add_transaction', module: 'finance', permission: 'write',
  description: 'Catat pengeluaran atau pemasukan. Pahami nominal seperti "30rb", "goceng", "1,2 jt" lalu kirim sebagai angka. Satu kalimat bisa berisi beberapa transaksi: panggil tool ini beberapa kali.',
  parameters: txParams,
  async prepare(ctx, a) {
    const doubtful: string[] = [];
    let categoryId: string | null = null;
    let categoryLabel = 'Tanpa kategori';
    // SPEC 7.2: aturan merchant di memori dulu, baru kategori yang disebut, merchant, lalu kata di catatan
    const rule = await merchantRule(ctx, [a.merchant, a.note]);
    if (rule) { categoryId = rule.id; categoryLabel = rule.label; }
    if (!categoryId && a.category) {
      const r = await resolveCategory(ctx.db, a.category, a.kind);
      if (r.kind === 'found') { categoryId = r.id; categoryLabel = r.label; }
      else if (r.kind === 'ambiguous') return pick(r, 'category', 'kategori', a.category) as never;
    }
    // merchant dan catatan utuh boleh cocok longgar, kata lepas di catatan harus persis (hindari "pak" → "paket")
    const guesses: [string | undefined, boolean][] = [[a.merchant, false], [a.note, true], ...(a.note ?? '').split(/\s+/).filter((w) => w.length >= 4).map((w) => [w, true] as [string, boolean])];
    for (const [text, exact] of guesses) {
      if (categoryId || !text) continue;
      const r = await resolveCategory(ctx.db, text, a.kind, { exact });
      if (r.kind === 'found') { categoryId = r.id; categoryLabel = r.label; }
    }
    if (!categoryId) {
      const { data } = await ctx.db.from('categories').select('id,name').eq('slug', a.kind === 'income' ? 'i_lain' : 'o_lain').maybeSingle();
      categoryId = data?.id ?? null; categoryLabel = data?.name ?? categoryLabel;
      doubtful.push('category');
    }
    let accountId: string | null;
    if (a.account) {
      const r = pick(await resolveAccount(ctx.db, a.account), 'account', 'akun', a.account);
      if (isErr(r)) return r;
      accountId = r.id;
    } else {
      // koreksi akun dari pengguna sebelumnya ("bensin" selalu GoPay) mengalahkan tebakan statistik
      const learned = await memoryFor(ctx, 'correction', 'account_id', [a.merchant, a.note]);
      const { data: ok } = learned ? await ctx.db.from('accounts').select('id').eq('id', learned).eq('is_archived', false).maybeSingle() : { data: null };
      accountId = ok?.id ?? await mostUsedAccount(ctx, categoryId);
      if (!ok) doubtful.push('account');
    }
    if (!accountId) return fail('Belum ada akun. Minta pengguna menambah akun dulu.', { field: 'account' });
    const accName = (await accountNames(ctx)).get(accountId);
    const occurred = a.occurred_at ? toIso(a.occurred_at)! : ctx.now.toISOString();
    const date = zonedParts(occurred).date;
    return {
      ok: true,
      summary: `${KIND_LABEL[a.kind]} ${rp(a.amount)} · ${categoryLabel} · ${accName}${date !== ctx.today ? ` · ${date}` : ''}`,
      doubtful: doubtful.length ? doubtful : undefined,
      warning: doubtful.includes('account') ? 'Akun tidak disebut, dipilih akun yang paling sering dipakai.' : undefined,
      resolved: { kind: a.kind, amount: a.amount, account_id: accountId, category_id: categoryId, merchant: a.merchant ?? null, note: a.note ?? null, occurred_at: occurred, receipt_id: a.receipt_id ?? null, source: 'agent' },
    };
  },
  async commit(ctx, r) {
    const res = await insertRow(ctx, 'transactions', r);
    if (isErr(res)) return res;
    return { ok: true, data: { id: res.id }, undo: { ops: [res.undo] } };
  },
};

const tfParams = z.object({
  amount: money('Nominal yang dipindahkan'),
  from_account: z.string().describe('Akun asal. "Tarik tunai" = dari bank ke akun tunai.'),
  to_account: z.string().describe('Akun tujuan. "Top up" = ke dompet digital.'),
  fee: money('Biaya admin, dicatat sebagai pengeluaran terpisah').optional(),
  occurred_at: when('Waktu, kosong = sekarang').optional(),
});
type TfResolved = { amount: number; from: string; to: string; fee: number; occurred_at: string };

export const addTransfer: WriteTool<typeof tfParams, TfResolved> = {
  name: 'add_transfer', module: 'finance', permission: 'write',
  description: 'Pindahkan uang antar akun milik sendiri (bukan pengeluaran). Termasuk tarik tunai, setor tunai, dan top up dompet digital. Biaya admin dicatat terpisah.',
  parameters: tfParams,
  async prepare(ctx, a) {
    const from = pick(await resolveAccount(ctx.db, a.from_account), 'from_account', 'akun asal', a.from_account);
    if (isErr(from)) return from;
    const to = pick(await resolveAccount(ctx.db, a.to_account), 'to_account', 'akun tujuan', a.to_account);
    if (isErr(to)) return to;
    if (from.id === to.id) return fail('Akun asal dan tujuan sama.', { field: 'to_account' });
    const occurred = a.occurred_at ? toIso(a.occurred_at)! : ctx.now.toISOString();
    return {
      ok: true,
      summary: `Transfer ${rp(a.amount)} · ${from.label} → ${to.label}${a.fee ? ` · admin ${rp(a.fee)}` : ''}`,
      resolved: { amount: a.amount, from: from.id, to: to.id, fee: a.fee ?? 0, occurred_at: occurred },
    };
  },
  async commit(ctx, r) {
    const group = r.fee > 0 ? crypto.randomUUID() : null;
    const ops: UndoOp[] = [];
    const t = await insertRow(ctx, 'transactions', { kind: 'transfer', amount: r.amount, account_id: r.from, to_account_id: r.to, occurred_at: r.occurred_at, group_id: group, source: 'agent', note: 'Transfer' });
    if (isErr(t)) return t;
    ops.push(t.undo);
    if (group) {
      const { data: admin } = await ctx.db.from('categories').select('id').eq('slug', 'o_admin').maybeSingle();
      const f = await insertRow(ctx, 'transactions', { kind: 'expense', amount: r.fee, account_id: r.from, category_id: admin?.id ?? null, occurred_at: r.occurred_at, group_id: group, source: 'agent', note: 'Biaya admin' });
      if (isErr(f)) { await ctx.db.from('transactions').delete().eq('id', t.id); return f; }
      ops.push(f.undo);
    }
    return { ok: true, data: { id: t.id, group_id: group }, undo: { ops } };
  },
};

const updParams = z.object({
  id: z.uuid().describe('Id transaksi dari search_transactions'),
  amount: money('Nominal baru').optional(),
  account: z.string().optional(),
  category: z.string().optional(),
  note: z.string().max(500).optional(),
  merchant: z.string().max(120).optional(),
  occurred_at: when('Waktu baru').optional(),
});
type UpdResolved = { id: string; values: Record<string, unknown> };

export const updateTransaction: WriteTool<typeof updParams, UpdResolved> = {
  name: 'update_transaction', module: 'finance', permission: 'destructive',
  description: 'Ubah transaksi yang sudah ada (nominal, akun, kategori, catatan, waktu). Cari id-nya dulu dengan search_transactions. Saldo akun disesuaikan otomatis.',
  parameters: updParams,
  async prepare(ctx, a) {
    const { data: old } = await ctx.db.from('transactions').select('id,kind,amount,account_id,category_id,note,occurred_at').eq('id', a.id).maybeSingle();
    if (!old) return fail('Transaksi tidak ditemukan.', { field: 'id' });
    const values: Record<string, unknown> = {};
    const changes: string[] = [];
    if (a.amount && a.amount !== old.amount) { values.amount = a.amount; changes.push(`${rp(old.amount)} → ${rp(a.amount)}`); }
    if (a.account) {
      const r = pick(await resolveAccount(ctx.db, a.account), 'account', 'akun', a.account);
      if (isErr(r)) return r;
      values.account_id = r.id; changes.push(`akun ${r.label}`);
    }
    if (a.category && old.kind !== 'transfer') {
      const r = pick(await resolveCategory(ctx.db, a.category, old.kind), 'category', 'kategori', a.category);
      if (isErr(r)) return r;
      values.category_id = r.id; changes.push(`kategori ${r.label}`);
    }
    if (a.note !== undefined) { values.note = a.note; changes.push('catatan'); }
    if (a.merchant !== undefined) { values.merchant = a.merchant; changes.push('merchant'); }
    if (a.occurred_at) { values.occurred_at = toIso(a.occurred_at); changes.push(`tanggal ${a.occurred_at.slice(0, 10)}`); }
    if (!changes.length) return fail('Tidak ada yang diubah.');
    return { ok: true, summary: `Ubah ${KIND_LABEL[old.kind as keyof typeof KIND_LABEL].toLowerCase()} ${rp(old.amount)} (${zonedParts(old.occurred_at).date}): ${changes.join(', ')}`, resolved: { id: a.id, values } };
  },
  async commit(ctx, r) {
    const u = await updateRow(ctx, 'transactions', r.id, r.values);
    if (isErr(u)) return u;
    return { ok: true, data: { id: r.id }, undo: { ops: [u] } };
  },
};

export const deleteTransaction: WriteTool<z.ZodObject<{ id: z.ZodUUID }>, { id: string }> = {
  name: 'delete_transaction', module: 'finance', permission: 'destructive',
  description: 'Hapus transaksi. Cari id-nya dulu dengan search_transactions. Saldo akun dikembalikan otomatis.',
  parameters: z.object({ id: z.uuid() }),
  async prepare(ctx, { id }) {
    const { data: t } = await ctx.db.from('transactions').select('kind,amount,occurred_at,note').eq('id', id).maybeSingle();
    if (!t) return fail('Transaksi tidak ditemukan.', { field: 'id' });
    return { ok: true, summary: `Hapus ${KIND_LABEL[t.kind as keyof typeof KIND_LABEL].toLowerCase()} ${rp(t.amount)} · ${zonedParts(t.occurred_at).date}${t.note ? ` · ${t.note}` : ''}`, resolved: { id } };
  },
  async commit(ctx, { id }) {
    const d = await deleteRow(ctx, 'transactions', id);
    if (isErr(d)) return d;
    return { ok: true, data: { id }, undo: { ops: [d] } };
  },
};

const billParams = z.object({
  name: z.string().min(1).max(80),
  amount: money('Nominal tagihan'),
  frequency: z.enum(['monthly', 'yearly', 'once']).optional().describe('Bawaan monthly'),
  due_day: z.number().int().min(1).max(31).optional().describe('Tanggal jatuh tempo tiap bulan'),
  due_date: dateStr('Tanggal jatuh tempo (sekali bayar atau tahunan)').optional(),
  account: z.string().optional().describe('Akun pembayaran'),
  category: z.string().optional(),
});
type BillResolved = Record<string, unknown>;

export const addBill: WriteTool<typeof billParams, BillResolved> = {
  name: 'add_bill', module: 'finance', permission: 'write',
  description: 'Tambah tagihan rutin (mis. kos tiap tanggal 5, wifi) atau sekali bayar.',
  parameters: billParams,
  async prepare(ctx, a) {
    const freq = a.frequency ?? (a.due_date && !a.due_day ? 'once' : 'monthly');
    let next = a.due_date ?? null;
    if (!next && a.due_day) {
      const [y, m] = ctx.today.split('-').map(Number);
      const mk = (yy: number, mm: number) => { const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate(); return `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(a.due_day!, last)).padStart(2, '0')}`; };
      next = mk(y, m);
      if (next < ctx.today) next = m === 12 ? mk(y + 1, 1) : mk(y, m + 1);
    }
    if (!next) return fail('Butuh due_day atau due_date.', { field: 'due_day' });
    let accountId: string | null = null; let accLabel = '';
    if (a.account) { const r = pick(await resolveAccount(ctx.db, a.account), 'account', 'akun', a.account); if (isErr(r)) return r; accountId = r.id; accLabel = ` · ${r.label}`; }
    let categoryId: string | null = null;
    const r = await resolveCategory(ctx.db, a.category ?? a.name, 'expense');
    if (r.kind === 'found') categoryId = r.id;
    return {
      ok: true, summary: `Tagihan ${a.name} ${rp(a.amount)} · ${freq === 'monthly' ? `tiap tanggal ${Number(next.slice(8))}` : freq === 'yearly' ? 'tahunan' : 'sekali'} · mulai ${next}${accLabel}`,
      resolved: { name: a.name, amount: a.amount, frequency: freq, next_due_date: next, due_day: freq === 'monthly' ? Number(next.slice(8)) : null, due_date: freq === 'monthly' ? null : next, is_recurring: freq !== 'once', default_account_id: accountId, category_id: categoryId },
    };
  },
  async commit(ctx, r) {
    const res = await insertRow(ctx, 'bills', r);
    if (isErr(res)) return res;
    return { ok: true, data: { id: res.id }, undo: { ops: [res.undo] } };
  },
};

const invParams = z.object({
  investment_id: z.uuid().optional(),
  name: z.string().optional().describe('Nama investasi bila id tidak diketahui'),
  current_value: money('Nilai sekarang'),
  units: z.number().nonnegative().optional(),
});
export const updateInvestment: WriteTool<typeof invParams, { id: string; values: Record<string, unknown> }> = {
  name: 'update_investment', module: 'finance', permission: 'write',
  description: 'Perbarui nilai sekarang (dan unit) sebuah investasi.',
  parameters: invParams,
  async prepare(ctx, a) {
    const q = a.investment_id ?? a.name;
    if (!q) return fail('Sebutkan investment_id atau name.', { field: 'name' });
    const r = pick(await resolveInvestment(ctx.db, q), 'name', 'investasi', q);
    if (isErr(r)) return r;
    const { data: old } = await ctx.db.from('investments').select('current_value').eq('id', r.id).maybeSingle();
    return {
      ok: true, summary: `Nilai ${r.label}: ${rp(old?.current_value ?? 0)} → ${rp(a.current_value)}`,
      resolved: { id: r.id, values: { current_value: a.current_value, valued_at: ctx.today, ...(a.units != null ? { units: a.units } : {}) } },
    };
  },
  async commit(ctx, r) {
    const u = await updateRow(ctx, 'investments', r.id, r.values);
    if (isErr(u)) return u;
    return { ok: true, data: { id: r.id }, undo: { ops: [u] } };
  },
};

export const financeTools = [getBalances, searchTransactions, spendingSummary, getBills, addTransaction, addTransfer, updateTransaction, deleteTransaction, addBill, updateInvestment];
