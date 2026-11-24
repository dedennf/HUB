// Uji integrasi modul Bahasa Inggris (Fase 7) di Supabase lokal. Dilewati bila env tidak ada.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgentModel, ModelRequest } from '@/lib/agent/model';
import { handleMessage } from '@/lib/agent/service';
import { todayIso } from '@/lib/time';
import { gradeVocab, loadProfile, saveSubmission } from './store';

const URL = process.env.KOMPAS_IT_URL;
const ANON = process.env.KOMPAS_IT_ANON;
const SERVICE = process.env.KOMPAS_IT_SERVICE;
const run = !!(URL && ANON && SERVICE);

describe.skipIf(!run)('bahasa Inggris', () => {
  let admin: SupabaseClient;
  let db: SupabaseClient;
  let userId = '';
  const ctx = () => ({ db, now: new Date(), today: todayIso() });

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
    const email = `uji-bahasa-${Date.now()}@example.com`;
    const password = `Uji-${Math.random().toString(36).slice(2)}-Aa1!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    db = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await db.auth.signInWithPassword({ email, password });
    await db.rpc('bootstrap_user');
  });
  afterAll(async () => { if (userId) await admin.auth.admin.deleteUser(userId); });

  it('review SM-2: Bisa menjadwalkan 1 hari, Bisa lagi 6 hari, Lupa kembali ke 1 dan menambah lapses', async () => {
    const { data: v } = await db.from('vocab').insert({ term: 'outcrop', meaning_id: 'singkapan' }).select('id').single();
    const now = new Date();
    expect((await gradeVocab(db, v!.id, 4, now)).interval_days).toBe(1);
    expect((await gradeVocab(db, v!.id, 4, now)).interval_days).toBe(6);
    const lupa = await gradeVocab(db, v!.id, 1, now);
    expect(lupa).toMatchObject({ interval_days: 1, repetitions: 0, lapses: 1 });
    const { count } = await db.from('vocab_reviews').select('id', { count: 'exact', head: true }).eq('vocab_id', v!.id);
    expect(count).toBe(3);
  });

  it('koreksi tulisan menambah hitungan pola kesalahan', async () => {
    const m = [{ original: 'a outcrop', fix: 'an outcrop', type: 'article a/an/the', explanation_id: 'vokal' }];
    await saveSubmission(db, { kind: 'abstract', original: 'This is a outcrop.', corrected: 'This is an outcrop.', mistakes: m }, new Date());
    await saveSubmission(db, { kind: 'free', original: 'I saw a apple.', corrected: 'I saw an apple.', mistakes: m }, new Date());
    const { data } = await db.from('mistake_patterns').select('pattern,count');
    expect(data).toEqual([{ pattern: 'article a/an/the', count: 2 }]);
    expect((await loadProfile(db)).topMistakes).toEqual(['article a/an/the']);
  });

  it('English Mode: perintah tetap dijalankan, umpan balik bahasa tampil dan tersimpan', async () => {
    await db.from('settings').upsert({ key: 'english_mode', value: true }, { onConflict: 'user_id,key' });
    const reqs: ModelRequest[] = [];
    const model: AgentModel = {
      name: 'fake',
      generate: async (req) => {
        reqs.push(req);
        // panggilan umpan balik bahasa meminta JSON, loop agen tidak
        const text = req.json
          ? JSON.stringify({ is_english: true, corrected: 'How much money do I have?', notes: [{ original: 'how many money', fix: 'how much money', type: 'word choice', explanation_id: 'money tidak bisa dihitung.' }] })
          : 'You have Rp0 in total.';
        return { content: { role: 'model', parts: [{ text }] }, functionCalls: [], text };
      },
    };
    const r = await handleMessage(ctx(), model, 'how many money i have', null);
    expect(r.reply).toBe('You have Rp0 in total.');
    expect(r.english_feedback).toEqual({ corrected: 'How much money do I have?', notes: [{ original: 'how many money', fix: 'how much money', explanation_id: 'money tidak bisa dihitung.' }] });
    const agentReq = reqs.find((q) => !q.json)!;
    expect(agentReq.system).toMatch(/English Mode aktif/);
    const { data: sub } = await db.from('writing_submissions').select('kind,original').eq('kind', 'english_mode');
    expect(sub).toEqual([{ kind: 'english_mode', original: 'how many money i have' }]);

    // English Mode mati: tidak ada panggilan umpan balik
    await db.from('settings').upsert({ key: 'english_mode', value: false }, { onConflict: 'user_id,key' });
    reqs.length = 0;
    const off = await handleMessage(ctx(), model, 'how many money i have', null);
    expect(off.english_feedback).toBeNull();
    expect(reqs.some((q) => q.json)).toBe(false);
  });
});
