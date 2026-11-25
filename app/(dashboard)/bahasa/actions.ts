'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import {
  correctWriting, explainText, speakingQuestion, vocabEntry, type Correction, type Explanation, type VocabEntry,
} from '@/lib/english/ai';
import { withModel, type Result } from '@/lib/english/run';
import { gradeVocab, loadProfile, logSession, saveSubmission } from '@/lib/english/store';
import { createClient } from '@/lib/supabase/server';

export type { Result } from '@/lib/english/run';

const uuid = z.uuid();

/* ---------------- review kartu (SM-2) ---------------- */

export async function gradeCard(id: string, grade: number): Promise<Result<{ interval_days: number }>> {
  await requireUser();
  if (!uuid.safeParse(id).success || ![1, 3, 4, 5].includes(grade)) return { ok: false, message: 'Nilai tidak valid.' };
  try {
    const next = await gradeVocab(await createClient(), id, grade, new Date());
    return { ok: true, data: { interval_days: next.interval_days } };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function finishReview(count: number, seconds: number): Promise<void> {
  await requireUser();
  if (count > 0) await logSession(await createClient(), { kind: 'review', seconds: Math.min(seconds, 7200), summary: `${count} kartu diulang` });
  revalidatePath('/bahasa');
}

/* ---------------- bank kata ---------------- */

const vocabForm = z.object({
  term: z.string().trim().min(1).max(120), meaning_id: z.string().trim().max(300).optional(), definition_en: z.string().trim().max(500).optional(),
  example: z.string().trim().max(500).optional(), part_of_speech: z.string().trim().max(30).optional(),
  source_type: z.enum(['manual', 'reading', 'mistake', 'agent']).optional(), source_ref: z.uuid().optional(),
});

/** Tambah kata ke bank kata. Pengguna sendiri yang menekan Simpan, jadi langsung tersimpan. */
export async function addVocab(input: z.input<typeof vocabForm>): Promise<Result<{ id: string }>> {
  await requireUser();
  const p = vocabForm.safeParse(Object.fromEntries(Object.entries(input).filter(([, v]) => v !== '' && v != null)));
  if (!p.success) return { ok: false, message: 'Kata wajib diisi (maks 120 huruf).' };
  const db = await createClient();
  const { data: dup } = await db.from('vocab').select('id').ilike('term', p.data.term).limit(1);
  if (dup?.length) return { ok: false, message: `"${p.data.term}" sudah ada di bank kata.` };
  const { data, error } = await db.from('vocab').insert({ ...p.data, source_type: p.data.source_type ?? 'manual' }).select('id').single();
  if (error || !data) return { ok: false, message: 'Gagal menyimpan kata.' };
  revalidatePath('/bahasa');
  return { ok: true, data: { id: data.id } };
}

export async function deleteVocab(id: string): Promise<Result<null>> {
  await requireUser();
  if (!uuid.safeParse(id).success) return { ok: false, message: 'Kata tidak valid.' };
  await (await createClient()).from('vocab').delete().eq('id', id);
  revalidatePath('/bahasa');
  return { ok: true, data: null };
}

export async function autofillVocab(term: string, context?: string): Promise<Result<VocabEntry>> {
  await requireUser();
  const t = term.trim().slice(0, 120);
  if (!t) return { ok: false, message: 'Tulis katanya dulu.' };
  const profile = await loadProfile(await createClient());
  return withModel((m) => vocabEntry(m, profile, { term: t, context: context?.slice(0, 600) }, AbortSignal.timeout(25_000)));
}

/* ---------------- membaca berpendamping ---------------- */

export async function explain(text: string, context: string | undefined, breakdown: boolean): Promise<Result<Explanation>> {
  await requireUser();
  const t = text.trim().slice(0, 1500);
  if (!t) return { ok: false, message: 'Pilih kata atau kalimat dulu.' };
  const profile = await loadProfile(await createClient());
  return withModel((m) => explainText(m, profile, { text: t, context: context?.slice(0, 800), breakdown }, AbortSignal.timeout(30_000)));
}

export async function finishReading(seconds: number, words: number): Promise<void> {
  await requireUser();
  if (seconds >= 30) await logSession(await createClient(), { kind: 'reading', seconds: Math.min(seconds, 7200), summary: words ? `${words} kata disimpan` : 'Membaca berpendamping' });
}

/* ---------------- koreksi tulisan ---------------- */

const KINDS = ['free', 'summary', 'abstract', 'journal'] as const;

export async function correct(text: string, kind: string, prompt?: string): Promise<Result<Correction & { id: string }>> {
  await requireUser();
  const t = text.trim();
  if (t.length < 10) return { ok: false, message: 'Tulis minimal satu kalimat dulu.' };
  if (t.length > 4000) return { ok: false, message: 'Tulisan terlalu panjang (maks 4.000 huruf). Kirim per bagian.' };
  const k = (KINDS as readonly string[]).includes(kind) ? (kind as (typeof KINDS)[number]) : 'free';
  const db = await createClient();
  const profile = await loadProfile(db);
  const label = { free: 'tulisan bebas', summary: 'ringkasan jurnal', abstract: 'draf abstrak', journal: 'jurnal harian' }[k];
  const r = await withModel((m) => correctWriting(m, profile, { text: t, kind: label, onlyImportant: profile.correction === 'important_only' }, AbortSignal.timeout(45_000)));
  if (!r.ok) return r;
  const now = new Date();
  const saved = await saveSubmission(db, { kind: k, original: t, corrected: r.data.corrected, prompt: prompt?.slice(0, 500) ?? null, mistakes: r.data.mistakes, score: r.data.score, summary: r.data.summary_id }, now);
  await logSession(db, { kind: 'writing', summary: `${label}: ${r.data.mistakes.length} catatan`, score: r.data.score });
  revalidatePath('/bahasa');
  return { ok: true, data: { ...r.data, id: saved.id } };
}

/* ---------------- latihan bicara ---------------- */

export async function newSpeakingQuestion(topic?: string): Promise<Result<{ question: string; hint_id: string }>> {
  await requireUser();
  const profile = await loadProfile(await createClient());
  return withModel((m) => speakingQuestion(m, profile, { topic: topic?.slice(0, 120) }, AbortSignal.timeout(25_000)));
}

/* ---------------- pengaturan bahasa (SPEC 10.1) ---------------- */

const settingsForm = z.object({
  english_level: z.enum(['beginner', 'intermediate', 'upper_intermediate']),
  english_goal: z.enum(['academic_general', 'toefl', 'ielts', 'conversation', 'career']),
  english_daily_minutes: z.coerce.number().int().min(5).max(180),
  english_correction_level: z.enum(['all', 'important_only', 'off']),
  english_target_band: z.coerce.number().min(4).max(9).refine((n) => Number.isInteger(n * 2), 'Kelipatan 0,5.'),
  english_test_date: z.union([z.literal(''), z.iso.date()]).transform((v) => v || null),
});

export async function saveEnglishSettings(_prev: { ok: boolean; message?: string }, form: FormData): Promise<{ ok: boolean; message?: string }> {
  await requireUser();
  const p = settingsForm.safeParse(Object.fromEntries(form.entries()));
  if (!p.success) return { ok: false, message: 'Pilihan tidak valid.' };
  const db = await createClient();
  for (const [key, value] of Object.entries(p.data)) {
    // tanggal tes kosong berarti belum ditentukan: hapus barisnya (kolom value wajib diisi)
    const { error } = value == null
      ? await db.from('settings').delete().eq('key', key)
      : await db.from('settings').upsert({ key, value }, { onConflict: 'user_id,key' });
    if (error) return { ok: false, message: 'Gagal menyimpan.' };
  }
  revalidatePath('/bahasa');
  return { ok: true, message: 'Pengaturan bahasa tersimpan.' };
}

/** Sakelar English Mode di Ra (SPEC 10.2.5). */
export async function setEnglishMode(on: boolean): Promise<void> {
  await requireUser();
  await (await createClient()).from('settings').upsert({ key: 'english_mode', value: on }, { onConflict: 'user_id,key' });
}

/** Simpan teks (abstrak atau kutipan) ke bacaan di modul Riset supaya bisa dibaca lagi nanti. */
export async function saveReadingText(id: string, text: string): Promise<Result<null>> {
  await requireUser();
  if (!uuid.safeParse(id).success) return { ok: false, message: 'Bacaan tidak valid.' };
  const t = text.trim().slice(0, 20_000);
  const { error } = await (await createClient()).from('readings').update({ content_excerpt: t || null }).eq('id', id);
  return error ? { ok: false, message: 'Gagal menyimpan teks.' } : { ok: true, data: null };
}
