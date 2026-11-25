// Uji integrasi sesi harian IELTS (D-60) di Supabase lokal. Dilewati bila env tidak ada.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bandSummary, ensureDay, markSkillIfToday, markStep, saveGrammarScore } from './ielts-store';
import { saveSubmission, logSession, loadProfile } from './store';

const URL = process.env.KOMPAS_IT_URL;
const ANON = process.env.KOMPAS_IT_ANON;
const SERVICE = process.env.KOMPAS_IT_SERVICE;
const run = !!(URL && ANON && SERVICE);

describe.skipIf(!run)('IELTS: sesi harian dan band', () => {
  let admin: SupabaseClient;
  let db: SupabaseClient;
  let other: SupabaseClient;
  const ids: string[] = [];
  const DAY = '2026-11-24'; // Selasa: Writing Task 2

  const user = async () => {
    const email = `uji-ielts-${Date.now()}-${ids.length}@example.com`;
    const password = `Uji-${Math.random().toString(36).slice(2)}-Aa1!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    ids.push(data.user.id);
    const c = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password });
    return c;
  };

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
    db = await user();
    other = await user();
  });
  afterAll(async () => { for (const id of ids) await admin.auth.admin.deleteUser(id); });

  it('ensureDay membuat satu baris per hari dengan skill dan topik grammar', async () => {
    await db.from('mistake_patterns').insert({ pattern: 'article a/an/the', count: 5 });
    const profile = await loadProfile(db);
    const [a, b] = await Promise.all([ensureDay(db, DAY, profile), ensureDay(db, DAY, profile)]);
    expect(a.id).toBe(b.id);
    expect(a.skill).toBe('writing_task2');
    expect(a.grammar_key).toBe('articles');
    const { count } = await db.from('english_days').select('id', { count: 'exact', head: true }).eq('day', DAY);
    expect(count).toBe(1);
  });

  it('langkah dan skor grammar tersimpan, topik dikuasai pindah ke topik berikutnya', async () => {
    await markStep(db, DAY, 'review');
    await saveGrammarScore(db, DAY, 'articles', 5, new Date());
    await markSkillIfToday(db, DAY, 'speaking_part2'); // bukan skill hari ini, tidak dicentang
    let { data } = await db.from('english_days').select('done,grammar_score').eq('day', DAY).single();
    expect(data).toMatchObject({ done: { review: true, grammar: true }, grammar_score: 5 });
    await markSkillIfToday(db, DAY, 'writing_task2');
    ({ data } = await db.from('english_days').select('done').eq('day', DAY).single());
    expect(data!.done).toMatchObject({ skill: true });
    const next = await ensureDay(db, '2026-11-25', await loadProfile(db));
    expect(next.grammar_key).not.toBe('articles');
  });

  it('perkiraan band dari Writing, Speaking, dan Reading', async () => {
    const now = new Date();
    const bands = { task: 6, coherence: 6.5, lexical: 6, grammar: 5.5 };
    await saveSubmission(db, { kind: 'ielts_task2', original: 'essay text', corrected: '', mistakes: [], extra: { bands, band: 6 } }, now);
    await logSession(db, { kind: 'speaking', score: { bands: { fluency: 7, lexical: 6.5, grammar: 6.5, pronunciation: 7 } } });
    await logSession(db, { kind: 'reading', score: { band: 6.5, correct: 4, total: 6 } });
    const s = await bandSummary(db, new Date().toISOString().slice(0, 10));
    expect(s).toMatchObject({ writing: 6, speaking: 7, reading: 6.5, listening: null, overall: 6.5 });
  });

  it('RLS: pengguna lain tidak melihat sesi dan kemajuan grammar', async () => {
    const { data: d } = await other.from('english_days').select('id');
    const { data: g } = await other.from('grammar_progress').select('id');
    expect(d).toEqual([]);
    expect(g).toEqual([]);
    const { error } = await other.from('english_days').insert({ day: DAY, skill: 'reading', user_id: ids[0] });
    expect(error).not.toBeNull();
  });
});
