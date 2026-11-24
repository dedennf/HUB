import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionUser } from '@/lib/auth';
import { ensureConversation } from '@/lib/agent/core';
import { loadProfile } from '@/lib/english/store';
import { liveConfig, liveModel } from '@/lib/live/config';
import { createClient } from '@/lib/supabase/server';
import { todayIso } from '@/lib/time';

export const maxDuration = 30;
const body = z.object({ mode: z.enum(['assistant', 'english']).default('assistant'), topic: z.string().max(120).optional() });
const LIVE_SESSIONS_PER_HOUR = 20;

/**
 * SPEC 7.3 tingkat 2: server hanya membuat token sementara. Klien tersambung langsung ke Gemini Live.
 * Token sekali pakai, sesi baru harus dimulai dalam 1 menit, sesi berakhir paling lama 30 menit.
 * Model, instruksi sistem, dan tools dikunci di token (liveConnectConstraints).
 */
export async function POST(req: Request) {
  const db = await createClient();
  if (!(await resolveSessionUser(db))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = liveModel();
  if (!apiKey || !model) return NextResponse.json({ error: 'Percakapan langsung belum diatur: isi GEMINI_LIVE_MODEL di server.' }, { status: 503 });
  const p = body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: 'Permintaan tidak valid.' }, { status: 400 });
  const { count } = await db.from('agent_conversations').select('id', { count: 'exact', head: true }).eq('title', 'Percakapan langsung').gte('created_at', new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= LIVE_SESSIONS_PER_HOUR) return NextResponse.json({ error: `Batas ${LIVE_SESSIONS_PER_HOUR} percakapan per jam tercapai. Coba lagi nanti.` }, { status: 429 });

  const now = new Date();
  try {
    const english = p.data.mode === 'english' ? { profile: await loadProfile(db), topic: p.data.topic } : undefined;
    const config = await liveConfig(db, p.data.mode, now, todayIso(now), english);
    const baseUrl = process.env.GEMINI_BASE_URL?.trim() || undefined; // hanya untuk uji dengan server tiruan
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha', ...(baseUrl ? { baseUrl } : {}) } });
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now.getTime() + 30 * 60_000).toISOString(),
        newSessionExpireTime: new Date(now.getTime() + 60_000).toISOString(),
        liveConnectConstraints: { model, config },
        httpOptions: { apiVersion: 'v1alpha' },
      },
    });
    if (!token.name) throw new Error('token kosong');
    const conversationId = await ensureConversation(db, null, 'voice', 'Percakapan langsung');
    return NextResponse.json({ token: token.name, model, mode: p.data.mode, conversation_id: conversationId, ...(baseUrl ? { base_url: baseUrl } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const status = (e as { status?: number }).status;
    console.error('[live] gagal membuat token:', status, (e as Error).message);
    return NextResponse.json({ error: status === 429 ? 'Kuota Gemini habis.' : 'Tidak bisa memulai percakapan dengan Gemini sekarang.' }, { status: 502 });
  }
}
