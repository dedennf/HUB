// Pencatatan alasan gagal login untuk Vercel Logs. Tidak pernah mencetak token, kode, atau email lengkap.

/** "pemilik@kampus.ac.id" menjadi "pe***@kampus.ac.id" (cukup untuk mengenali salah ketik). */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '(kosong)';
  const [name, domain] = email.split('@');
  if (!domain) return `${email.slice(0, 2)}***`;
  return `${name.slice(0, 2)}***@${domain}`;
}

export function logAuthFailure(where: string, reason: string, detail: Record<string, unknown> = {}): void {
  console.error(`[auth] ${where}: ${reason}`, detail);
}
