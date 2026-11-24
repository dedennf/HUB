// Lapisan yang dipakai route /api/agent*: batas laju, pilih Gemini atau cadangan, susun kartu untuk klien.
import type { SupabaseClient } from '@supabase/supabase-js';
import { cardFor, type ActionRow, type CardView, type Lookups } from './cards';
import { ensureConversation, runAgent } from './core';
import { runFallback } from './fallback';
import { ModelError, type AgentModel } from './model';
import type { ToolCtx } from './tools/types';

export const RATE_LIMIT_PER_MIN = 30;

export type AgentResponse = {
  conversation_id: string; reply: string; lines?: string[]; proposed_actions: CardView[]; lookups: Lookups;
  offline: string | null; english_feedback: null;
};

export async function loadLookups(db: SupabaseClient): Promise<Lookups> {
  const [acc, cat, sem, courses] = await Promise.all([
    db.from('accounts').select('id,name').eq('is_archived', false).neq('type', 'investment').order('sort_order'),
    db.from('categories').select('id,name,kind').eq('is_hidden', false).order('sort_order'),
    db.from('semesters').select('id').eq('is_active', true).maybeSingle(),
    db.from('courses').select('id,name,semester_id').order('name'),
  ]);
  const active = sem.data?.id;
  return {
    accounts: acc.data ?? [],
    categories: (cat.data ?? []) as Lookups['categories'],
    courses: (courses.data ?? []).filter((c) => !active || c.semester_id === active).map(({ id, name }) => ({ id, name })),
  };
}

export async function loadCards(db: SupabaseClient, ids: string[], lk: Lookups, today: string): Promise<CardView[]> {
  if (!ids.length) return [];
  const { data } = await db.from('agent_actions').select('id,tool_name,summary,permission,status,args,result').in('id', ids).order('created_at');
  return ((data ?? []) as ActionRow[]).map((r) => cardFor(r, lk, today));
}

/** Pesan pengguna dalam satu menit terakhir (SPEC 6.2: maksimal 30 per menit). */
export async function overRateLimit(ctx: ToolCtx): Promise<boolean> {
  const since = new Date(ctx.now.getTime() - 60_000).toISOString();
  const { count } = await ctx.db.from('agent_messages').select('id', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', since);
  return (count ?? 0) >= RATE_LIMIT_PER_MIN;
}

const OFFLINE_REASON: Record<ModelError['reason'], string> = {
  not_configured: 'Gemini belum diatur', quota: 'kuota habis', timeout: 'Gemini terlalu lama menjawab', rejected: 'permintaan ditolak Gemini', unavailable: 'Gemini tidak bisa dihubungi',
};

export async function handleMessage(ctx: ToolCtx, model: AgentModel | null, text: string, conversationId: string | null, opts: { maxSteps?: number; signal?: AbortSignal } = {}): Promise<AgentResponse> {
  const lookups = await loadLookups(ctx.db);
  let offline: string | null = model ? null : OFFLINE_REASON.not_configured;
  if (model) {
    try {
      const r = await runAgent({ ctx, model, text, conversationId, maxSteps: opts.maxSteps, signal: opts.signal });
      return { conversation_id: r.conversation_id, reply: r.reply, proposed_actions: await loadCards(ctx.db, r.action_ids, lookups, ctx.today), lookups, offline: null, english_feedback: null };
    } catch (e) {
      if (!(e instanceof ModelError)) throw e;
      console.error('[agent] Gemini gagal, pakai pengurai lokal:', e.reason, e.message);
      offline = OFFLINE_REASON[e.reason];
      // usulan yang sempat dibuat sebelum model gagal tidak ditampilkan, jadi ditolak supaya tidak menggantung
      await ctx.db.from('agent_actions').update({ status: 'rejected' }).eq('status', 'proposed').gte('created_at', ctx.now.toISOString());
    }
  }
  const convId = await ensureConversation(ctx.db, conversationId, 'text', text);
  const r = await runFallback(ctx, text, convId);
  const replyText = [r.reply, ...(r.lines ?? [])].join('\n');
  await ctx.db.from('agent_messages').insert([
    { conversation_id: convId, role: 'user', content: { role: 'user', parts: [{ text }] } },
    { conversation_id: convId, role: 'model', content: { role: 'model', parts: [{ text: replyText }] } },
  ]);
  return { conversation_id: convId, reply: r.reply, lines: r.lines, proposed_actions: await loadCards(ctx.db, r.action_ids, lookups, ctx.today), lookups, offline, english_feedback: null };
}
