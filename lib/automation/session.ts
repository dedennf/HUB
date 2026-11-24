// Sesi pemilik untuk penjadwal (D-50): tick berjalan sebagai pemilik, bukan service role, supaya RLS, nilai bawaan
// user_id, dan semua kode tools yang sudah ada berlaku persis seperti saat pemilik memakai app.
// Caranya: service role membuat tautan masuk (tanpa mengirim email), lalu token itu langsung ditukar jadi sesi.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export async function ownerSession(cfg: { url: string; anonKey: string; serviceKey: string; email: string }): Promise<{ db: SupabaseClient; userId: string; close: () => Promise<void> }> {
  const admin = createClient(cfg.url, cfg.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: cfg.email });
  const hash = data?.properties?.hashed_token;
  if (error || !hash) throw new Error(`Tidak bisa membuat sesi pemilik: ${error?.message ?? 'token kosong'}`);
  const db = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: s, error: e2 } = await db.auth.verifyOtp({ token_hash: hash, type: 'magiclink' });
  if (e2 || !s.user) throw new Error(`Sesi pemilik ditolak: ${e2?.message ?? 'tanpa pengguna'}`);
  // sesi sekali pakai: dihapus setelah tick supaya tidak menumpuk
  return { db, userId: s.user.id, close: async () => { await db.auth.signOut({ scope: 'local' }).catch(() => {}); } };
}
