import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = {
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getClaims: vi.fn(),
  signOut: vi.fn(),
};
const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth, rpc }) }));

const { GET } = await import('./route');

const OWNER = 'pemilik@kampus.ac.id';
const req = (qs: string) => new NextRequest(`https://hub.example.com/auth/confirm?${qs}`);
const location = (res: Response) => {
  const u = new URL(res.headers.get('location')!);
  return u.pathname + u.search;
};
const userWith = (email: string | undefined) => ({ id: 'u1', email });

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv('OWNER_EMAIL', OWNER);
  Object.values(auth).forEach((f) => f.mockReset());
  rpc.mockReset().mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
  // getClaims sengaja dibuat gagal: route tidak boleh bergantung padanya lagi.
  auth.getClaims.mockResolvedValue({ data: null, error: { message: 'Invalid JWT signature' } });
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  errors.mockRestore();
});

describe('/auth/confirm', () => {
  it('pemilik masuk walaupun getClaims kosong tepat setelah verifyOtp (bug not_owner)', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: userWith(OWNER), session: { user: userWith(OWNER) } }, error: null });
    const res = await GET(req('token_hash=rahasia123&type=email'));
    expect(location(res)).toBe('/');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'rahasia123', type: 'email' });
    expect(auth.getClaims).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('bootstrap_user');
  });

  it('perbedaan huruf besar dan spasi pada email tetap dianggap pemilik', async () => {
    vi.stubEnv('OWNER_EMAIL', '  Pemilik@Kampus.ac.id ');
    auth.verifyOtp.mockResolvedValue({ data: { user: userWith(OWNER), session: null }, error: null });
    expect(location(await GET(req('token_hash=x&type=magiclink')))).toBe('/');
  });

  it('alur ?code= memakai user dari sesi jika data.user tidak ada', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { user: null, session: { user: userWith(OWNER) } }, error: null });
    expect(location(await GET(req('code=abc')))).toBe('/');
  });

  it('email lain ditolak, sesi dihapus, alasan dicatat tanpa email lengkap', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: userWith('orang.lain@contoh.com'), session: null }, error: null });
    const res = await GET(req('token_hash=x&type=email'));
    expect(location(res)).toBe('/login?error=not_owner');
    expect(auth.signOut).toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    const logged = JSON.stringify(errors.mock.calls);
    expect(logged).toContain('email bukan pemilik');
    expect(logged).toContain('or***@contoh.com');
    expect(logged).not.toContain('orang.lain@contoh.com');
  });

  it('verifyOtp gagal: kembali ke /login?error=link dan token tidak ikut tercatat', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: { status: 403, code: 'otp_expired', message: 'Email link is invalid or has expired' } });
    const res = await GET(req('token_hash=TOKEN-SANGAT-RAHASIA&type=email'));
    expect(location(res)).toBe('/login?error=link');
    const logged = JSON.stringify(errors.mock.calls);
    expect(logged).toContain('otp_expired');
    expect(logged).not.toContain('TOKEN-SANGAT-RAHASIA');
  });

  it('verifikasi berhasil tanpa data user: dianggap tautan gagal, bukan not_owner', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
    expect(location(await GET(req('token_hash=x&type=email')))).toBe('/login?error=link');
  });

  it('parameter tidak lengkap atau type tidak dikenal', async () => {
    expect(location(await GET(req('')))).toBe('/login?error=link');
    expect(location(await GET(req('token_hash=x&type=hacker')))).toBe('/login?error=link');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('OWNER_EMAIL kosong di server: error=config, bukan not_owner', async () => {
    vi.stubEnv('OWNER_EMAIL', '');
    auth.verifyOtp.mockResolvedValue({ data: { user: userWith(OWNER), session: null }, error: null });
    expect(location(await GET(req('token_hash=x&type=email')))).toBe('/login?error=config');
    expect(auth.signOut).toHaveBeenCalled();
  });

  it('bootstrap_user gagal tidak menghalangi login, tetapi dicatat', async () => {
    rpc.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } });
    auth.verifyOtp.mockResolvedValue({ data: { user: userWith(OWNER), session: null }, error: null });
    expect(location(await GET(req('token_hash=x&type=email')))).toBe('/');
    expect(JSON.stringify(errors.mock.calls)).toContain('bootstrap_user gagal');
  });
});
