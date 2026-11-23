import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const signOut = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { signOut } }) }));
const { GET } = await import('./route');

describe('/auth/reject', () => {
  it('menghapus sesi lalu kembali ke /login?error=not_owner', async () => {
    const res = await GET(new NextRequest('https://hub.example.com/auth/reject'));
    expect(signOut).toHaveBeenCalled();
    const to = new URL(res.headers.get('location')!);
    expect(to.pathname + to.search).toBe('/login?error=not_owner');
  });
});
