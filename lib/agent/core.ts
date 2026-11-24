// Loop agen (SPEC 6.2): konteks + snapshot + memori + riwayat → Gemini → tool baca dijalankan,
// tool tulis menjadi usulan (agent_actions 'proposed') → selesai saat model menjawab teks.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FunctionDeclaration } from '@google/genai';
import { buildSnapshot, buildSystemPrompt, formatMemory, loadContextData, loadMemory, selectMemory } from './context-builder';
import { proposeAction } from './actions';
import { callTool } from './executor';
import type { AgentModel, Content } from './model';
import { functionDeclarations } from './tools';
import type { ToolCtx } from './tools/types';

export type AgentResult = { conversation_id: string; reply: string; action_ids: string[]; steps: number; english_feedback: null; transcript?: string | null };

/** SPEC 7.3: audio langsung ke Gemini. Transkrip diminta di baris pertama jawaban teks terakhir (D-47). */
export const VOICE_RULE = [
  'PESAN SUARA: pesan terakhir pengguna berupa rekaman suara (bahasa Indonesia santai, bisa campur Inggris dan bahasa daerah).',
  'Dengarkan, pahami maksudnya, lalu panggil tool seperti pesan teks biasa. Satu rekaman bisa berisi beberapa aksi.',
  'Jawaban teks terakhirmu WAJIB diawali satu baris "Transkrip: <ucapan pengguna apa adanya>", lalu baris baru berisi balasanmu.',
  'Bila rekaman kosong atau tidak jelas, tulis "Transkrip: (tidak jelas)" dan minta pengguna mengulang. Jangan menebak aksi.',
].join('\n');

/** Pisahkan baris "Transkrip: ..." dari balasan model. */
export function splitTranscript(reply: string): { transcript: string | null; reply: string } {
  const m = reply.match(/^\s*\**transkrip\**\s*:\s*\**\s*(.+?)\s*$/im);
  if (!m) return { transcript: null, reply: reply.trim() };
  const transcript = m[1].replace(/^["“]|["”]$/g, '').trim();
  return { transcript: /^\(?tidak jelas\)?$/i.test(transcript) ? null : transcript, reply: reply.replace(m[0], '').trim() };
}

const HISTORY_LIMIT = 16;

export async function ensureConversation(db: SupabaseClient, id: string | null, channel: string, title: string): Promise<string> {
  if (id) {
    const { data } = await db.from('agent_conversations').select('id').eq('id', id).maybeSingle();
    if (data) return data.id;
  }
  const { data, error } = await db.from('agent_conversations').insert({ channel, title: title.slice(0, 80) }).select('id').single();
  if (error || !data) throw new Error(`Gagal membuat percakapan: ${error?.message}`);
  return data.id;
}

async function loadHistory(db: SupabaseClient, conversationId: string): Promise<Content[]> {
  const { data } = await db.from('agent_messages').select('content').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(HISTORY_LIMIT);
  const list = (data ?? []).map((m) => m.content as Content).reverse();
  // riwayat harus dimulai dari giliran pengguna berisi teks, bukan respons fungsi yang terpotong
  while (list.length && (list[0].role !== 'user' || list[0].parts?.some((p) => p.functionResponse))) list.shift();
  return list;
}

/** Respons fungsi untuk model. Usulan tulis hanya memberi tahu bahwa aksi menunggu konfirmasi pengguna. */
function toolResponseFor(result: Awaited<ReturnType<typeof callTool>>, actionId?: string): Record<string, unknown> {
  if (result.kind === 'read') return { result: result.data };
  if (result.kind === 'proposal') return { status: 'menunggu_konfirmasi', action_id: actionId, summary: result.summary, doubtful: result.doubtful ?? [] };
  return { error: result.error, field: result.field, candidates: result.candidates };
}

export async function runAgent(opts: {
  ctx: ToolCtx; model: AgentModel; text: string; conversationId: string | null; channel?: 'text' | 'voice' | 'receipt'; maxSteps?: number; signal?: AbortSignal;
  /** Rekaman suara mentah (SPEC 7.3). Tidak disimpan: riwayat menyimpan transkripnya saja. */
  audio?: { data: Buffer; mime: string };
}): Promise<AgentResult> {
  const { ctx, model, text } = opts;
  const db = ctx.db;
  const [data, memory] = await Promise.all([loadContextData(db, ctx.now, ctx.today), loadMemory(db)]);
  const names = new Map<string, string>([...data.accounts.map((a) => [a.id, a.name] as const), ...data.categories.map((c) => [c.id, c.name] as const), ...data.courses.map((c) => [c.id, c.name] as const)]);
  const picked = selectMemory(memory, text);
  const system = [buildSystemPrompt(data), buildSnapshot(data), formatMemory(picked, names), opts.audio ? VOICE_RULE : ''].filter(Boolean).join('\n\n');
  const touched = picked.filter((m) => m.kind === 'merchant_rule' || m.kind === 'correction').map((m) => m.id).filter(Boolean);
  if (touched.length) await db.from('agent_memory').update({ last_used_at: ctx.now.toISOString() }).in('id', touched);

  const conversationId = await ensureConversation(db, opts.conversationId, opts.audio ? 'voice' : opts.channel ?? 'text', text || 'Pesan suara');
  const history = await loadHistory(db, conversationId);
  const userTurn: Content = opts.audio
    ? { role: 'user', parts: [{ inlineData: { mimeType: opts.audio.mime, data: opts.audio.data.toString('base64') } }, { text: text || '(pesan suara)' }] }
    : { role: 'user', parts: [{ text }] };
  const contents: Content[] = [...history, userTurn];
  const newMessages: { role: 'user' | 'model' | 'tool'; content: Content }[] = [{ role: 'user', content: userTurn }];
  const proposed: string[] = [];
  const tools = functionDeclarations() as FunctionDeclaration[];
  const maxSteps = opts.maxSteps ?? 6;
  let reply = '';
  let steps = 0;

  while (steps < maxSteps) {
    steps++;
    const turn = await model.generate({ system, contents, tools, signal: opts.signal });
    contents.push(turn.content);
    newMessages.push({ role: 'model', content: turn.content });
    if (!turn.functionCalls.length) { reply = turn.text; break; }

    const parts: NonNullable<Content['parts']> = [];
    for (const call of turn.functionCalls) {
      const result = await callTool(ctx, call.name, call.args);
      let actionId: string | undefined;
      if (result.kind === 'proposal') {
        actionId = await proposeAction(db, conversationId, result, call.args);
        proposed.push(actionId);
      }
      parts.push({ functionResponse: { id: call.id, name: call.name, response: toolResponseFor(result, actionId) } });
    }
    const toolTurn: Content = { role: 'user', parts };
    contents.push(toolTurn);
    newMessages.push({ role: 'tool', content: toolTurn });
  }

  let transcript: string | null | undefined;
  if (opts.audio) {
    ({ transcript, reply } = splitTranscript(reply));
    // audio tidak ikut disimpan: giliran pengguna di riwayat diganti transkripnya
    newMessages[0] = { role: 'user', content: { role: 'user', parts: [{ text: `[pesan suara] ${transcript ?? '(tidak tertranskrip)'}` }] } };
  }
  if (!reply) {
    reply = steps >= maxSteps
      ? 'Permintaannya terlalu panjang untuk diproses sekaligus. Coba pecah jadi beberapa perintah.'
      : proposed.length ? 'Cek dulu sebelum disimpan.' : 'Oke.';
  }
  await db.from('agent_messages').insert(newMessages.map((m) => ({ conversation_id: conversationId, role: m.role, content: m.content })));
  return { conversation_id: conversationId, reply, action_ids: proposed, steps, english_feedback: null, ...(opts.audio ? { transcript: transcript ?? null } : {}) };
}
