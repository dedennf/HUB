import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = { signInWithOtp: vi.fn(), verifyOtp: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn() };
const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth, rpc }) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'kompas.example.com' }) }));
const redirect = vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); });
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }));

const { sendLoginCode, verifyLoginCode, signInWithPassword } = await import('./actions');

const OWNER = 'pemilik@kampus.ac.id';
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const idle = { status: 'idle' as const, step: 'email' as const };
let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv('OWNER_EMAIL', OWNER);
  Object.values(auth).forEach((f) => f.mockReset());
  rpc.mockReset().mockResolvedValue({ error: null });
  redirect.mockClear();
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); errors.mockRestore(); });

describe('sendLoginCode', () => {
  it('mengirim OTP ke pemilik dan pindah ke langkah kode', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: null });
    const s = await sendLoginCode(idle, form({ email: OWNER }));
    expect(s).toMatchObject({ status: 'sent', step: 'code', email: OWNER });
    expect(auth.signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: OWNER, options: expect.objectContaining({ shouldCreateUser: false }) }));
  });
  it('email lain tidak dikirimi apa pun tapi tampilannya sama', async () => {
    const s = await sendLoginCode(idle, form({ email: 'orang@lain.com' }));
    expect(s.step).toBe('code');
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });
  it('batas kirim Supabase', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: { status: 429 } });
    const s = await sendLoginCode(idle, form({ email: OWNER }));
    expect(s).toMatchObject({ status: 'error', step: 'email' });
  });
});

describe('verifyLoginCode', () => {
  it('kode benar: verifyOtp tipe email, bootstrap, lalu ke Beranda', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: { id: 'u1', email: OWNER } }, error: null });
    await expect(verifyLoginCode(idle, form({ email: OWNER, code: '123 456' }))).rejects.toThrow('REDIRECT /');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: OWNER, token: '123456', type: 'email' });
    expect(rpc).toHaveBeenCalledWith('bootstrap_user');
  });
  it('kode salah tetap di langkah kode', async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: { status: 403, code: 'otp_expired', message: 'expired' } });
    const s = await verifyLoginCode(idle, form({ email: OWNER, code: '000000' }));
    expect(s).toMatchObject({ status: 'error', step: 'code', email: OWNER });
    expect(redirect).not.toHaveBeenCalled();
  });
  it('format kode salah tidak memanggil Supabase', async () => {
    const s = await verifyLoginCode(idle, form({ email: OWNER, code: '12ab' }));
    expect(s.status).toBe('error');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
  it('email bukan pemilik ditolak tanpa memanggil Supabase', async () => {
    const s = await verifyLoginCode(idle, form({ email: 'orang@lain.com', code: '123456' }));
    expect(s.status).toBe('error');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
});

describe('signInWithPassword', () => {
  it('sandi benar: masuk lalu ke Beranda', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1', email: OWNER } }, error: null });
    await expect(signInWithPassword(idle, form({ email: OWNER, password: 'rahasia123' }))).rejects.toThrow('REDIRECT /');
    expect(rpc).toHaveBeenCalledWith('bootstrap_user');
  });
  it('sandi salah: pesan umum tanpa pindah halaman', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { status: 400, code: 'invalid_credentials', message: 'x' } });
    const s = await signInWithPassword(idle, form({ email: OWNER, password: 'salah' }));
    expect(s.status).toBe('error');
    expect(redirect).not.toHaveBeenCalled();
  });
  it('email lain tidak pernah dicoba ke Supabase', async () => {
    const s = await signInWithPassword(idle, form({ email: 'orang@lain.com', password: 'x' }));
    expect(s.status).toBe('error');
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
});
