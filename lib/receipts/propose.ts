// Dari hasil ekstraksi struk ke usulan aksi lewat registry tools (SPEC 7.2).
// Bukti transfer antar akun sendiri → add_transfer. Selain itu → add_transaction pengeluaran.
// Kategori: merchant_rule di memori dulu (di dalam add_transaction), baru tebakan Gemini.
import { proposeAction } from '@/lib/agent/actions';
import { callTool, type CallResult } from '@/lib/agent/executor';
import { resolveAccount } from '@/lib/agent/resolve';
import { toIso } from '@/lib/agent/tools/common';
import type { ToolCtx } from '@/lib/agent/tools/types';
import { LOW_CONFIDENCE, type Extraction } from './extract';

export type ReceiptProposal =
  | { kind: 'proposed'; action_id: string; summary: string }
  | { kind: 'unreadable'; message: string };

type Proposal = Extract<CallResult, { kind: 'proposal' }>;

async function ownAccount(ctx: ToolCtx, hint: string | null): Promise<string | null> {
  if (!hint) return null;
  const r = await resolveAccount(ctx.db, hint);
  return r.kind === 'found' ? r.id : null;
}

/** Waktu dari struk. Tanggal di masa depan atau lebih dari setahun lalu dianggap salah baca. */
export function receiptTime(raw: string | null, now: Date): { iso: string | undefined; suspicious: boolean } {
  if (!raw) return { iso: undefined, suspicious: false };
  const iso = toIso(raw.replace(' ', 'T').slice(0, 16), '12:00') ?? toIso(raw.slice(0, 10), '12:00');
  if (!iso) return { iso: undefined, suspicious: true };
  const t = new Date(iso).getTime();
  if (t > now.getTime() + 36 * 3600_000 || t < now.getTime() - 400 * 86400_000) return { iso: undefined, suspicious: true };
  return { iso, suspicious: false };
}

export function itemsNote(x: Extraction): string | undefined {
  const names = x.items.map((i) => i.name.trim()).filter(Boolean);
  if (!names.length) return undefined;
  const head = names.slice(0, 4).join(', ');
  return (names.length > 4 ? `${head}, +${names.length - 4} lainnya` : head).slice(0, 200);
}

export async function proposeFromReceipt(ctx: ToolCtx, receiptId: string, x: Extraction, conversationId: string | null): Promise<ReceiptProposal> {
  if (!x.total || x.total <= 0) return { kind: 'unreadable', message: 'Total di struk tidak terbaca. Catat manual atau foto ulang lebih jelas.' };
  const low = x.confidence < LOW_CONFIDENCE;
  const time = receiptTime(x.occurred_at, ctx.now);
  const doubt = new Set<string>();
  if (low) { doubt.add('amount'); doubt.add('date'); }
  if (time.suspicious || (!x.occurred_at && low)) doubt.add('date');
  const warn = [
    low ? `Struk kurang jelas (keyakinan ${Math.round(x.confidence * 100)}%). Cek nominal dan tanggal.` : '',
    time.suspicious ? 'Tanggal di struk tidak masuk akal, dipakai waktu sekarang.' : '',
  ].filter(Boolean).join(' ');

  let call: { tool: string; args: Record<string, unknown> } | null = null;
  let proposal: Proposal | null = null;

  if (x.doc_type === 'transfer_proof') {
    const [from, to] = await Promise.all([ownAccount(ctx, x.from_account_hint), ownAccount(ctx, x.to_account_hint)]);
    if (from && to && from !== to) {
      call = { tool: 'add_transfer', args: { amount: x.total, from_account: from, to_account: to, occurred_at: time.iso, receipt_id: receiptId } };
      const r = await callTool(ctx, call.tool, call.args);
      if (r.kind === 'proposal') proposal = r;
    }
  }

  if (!proposal) {
    // transfer ke pihak lain atau struk belanja: pengeluaran dari akun yang disebut (cara bayar atau akun asal)
    const account = (await ownAccount(ctx, x.payment_method)) ?? (await ownAccount(ctx, x.from_account_hint));
    const base: Record<string, unknown> = {
      kind: 'expense', amount: x.total, merchant: x.merchant ?? x.to_account_hint ?? undefined, note: itemsNote(x),
      occurred_at: time.iso, receipt_id: receiptId,
    };
    // urutan percobaan: lengkap, tanpa tebakan kategori bila ambigu, tanpa akun bila ambigu
    const attempts = [
      { ...base, account: account ?? undefined, category: x.category_hint ?? undefined },
      { ...base, account: account ?? undefined },
      { ...base },
    ];
    for (const args of attempts) {
      const r = await callTool(ctx, 'add_transaction', args);
      if (r.kind === 'proposal') { call = { tool: 'add_transaction', args }; proposal = r; break; }
    }
  }
  if (!proposal || !call) return { kind: 'unreadable', message: 'Struk terbaca, tapi belum bisa diubah jadi transaksi. Catat manual.' };

  for (const d of proposal.doubtful ?? []) doubt.add(d);
  const merged: Proposal = { ...proposal, doubtful: [...doubt], warning: [warn, proposal.warning].filter(Boolean).join(' ') || undefined };
  const id = await proposeAction(ctx.db, conversationId, merged, call.args);
  return { kind: 'proposed', action_id: id, summary: merged.summary };
}
