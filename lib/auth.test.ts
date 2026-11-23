import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const auth = { getClaims: vi.fn(), getUser: vi.fn(), signOut: vi.fn() };
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth }) }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); },
}));

const { requireUser } = await import('./auth');
const OWNER = 'pemilik@kampus.ac.id';

beforeEach(() => {
  vi.stubEnv('OWNER_EMAIL', OWNER);
  Object.values(auth).forEach((f) => f.mockReset());
  auth.signOut.mockResolvedValue({ error: null });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('requireUser', () => {
  it('memakai klaim JWT jika tersedia', async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: 'u1', email: OWNER } }, error: null });
    await expect(requireUser()).resolves.toEqual({ id: 'u1', email: OWNER });
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it('getClaims gagal: jatuh ke getUser, pemilik tetap masuk', async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: { status: 500, message: 'jwks fetch failed' } });
    auth.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: OWNER } }, error: null });
    await expect(requireUser()).resolves.toEqual({ id: 'u1', email: OWNER });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('klaim tanpa email: email diambil dari getUser', async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: 'u1' } }, error: null });
    auth.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: OWNER } }, error: null });
    await expect(requireUser()).resolves.toEqual({ id: 'u1', email: OWNER });
  });

  it('tanpa sesi: ke /login tanpa menuduh bukan pemilik', async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: null });
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400, message: 'Auth session missing!' } });
    await expect(requireUser()).rejects.toThrow('REDIRECT:/login');
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('pengguna lain: dialihkan ke /auth/reject yang menghapus cookie sesi', async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: 'u2', email: 'lain@contoh.com' } }, error: null });
    await expect(requireUser()).rejects.toThrow('REDIRECT:/auth/reject');
    // signOut di Server Component tidak berefek, jadi tidak dipanggil di sini
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});
