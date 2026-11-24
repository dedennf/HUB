// Pemanggil API agen dari browser. Semua keputusan (setujui, tolak, undo) dikirim dengan id aksi saja.
import type { AgentResponse } from './service';

async function post<T>(url: string, body: unknown, form = false): Promise<T> {
  const res = await fetch(url, form ? { method: 'POST', body: body as FormData } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !('message' in data)) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export function sendToRa(text: string, conversationId: string | null): Promise<AgentResponse> {
  const fd = new FormData();
  fd.set('text', text);
  if (conversationId) fd.set('conversation_id', conversationId);
  return post<AgentResponse>('/api/agent', fd, true);
}

export type ConfirmResponse = { ok: boolean; message: string; executed: string[] };
export const confirmActions = (action_ids: string[], decision: 'approve' | 'reject', edits?: Record<string, Record<string, string>>) =>
  post<ConfirmResponse>('/api/agent/confirm', { action_ids, decision, edits });
export const undoActions = (action_ids: string[]) => post<{ ok: boolean; message: string }>('/api/agent/undo', { action_ids });
