// Variabel lingkungan. Dibaca saat dipakai (bukan saat build) supaya build tetap jalan tanpa .env.

export function supabasePublicEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY belum diisi.');
  }
  return { url, anonKey };
}

export function ownerEmail(): string {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error('OWNER_EMAIL belum diisi.');
  return email;
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase() === ownerEmail();
}
