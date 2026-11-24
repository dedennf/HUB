// Pemanggil API agen dari browser. Semua keputusan (setujui, tolak, undo) dikirim dengan id aksi saja.
import type { AgentResponse } from './service';

/** Galat dari API agen, pesannya sudah ramah ditampilkan. */
export class ApiFailure extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

async function post<T>(url: string, body: unknown, form = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, form ? { method: 'POST', body: body as FormData } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new ApiFailure('Tidak bisa menghubungi server Kompas. Cek koneksi internet.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !('message' in data)) {
    const fallback = res.status === 504 ? 'Server terlalu lama menjawab (504).' : res.status === 401 ? 'Sesi login habis. Muat ulang halaman lalu login lagi.' : `Server menjawab galat ${res.status}.`;
    throw new ApiFailure(data.error ?? fallback, res.status);
  }
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
