import type { Metadata } from 'next';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Masuk' };

const ERRORS: Record<string, string> = {
  not_owner: 'Akun ini tidak punya akses ke Hub Pribadi. Masuk dengan email pemilik (sama dengan OWNER_EMAIL di server).',
  link: 'Tautan masuk tidak valid atau sudah kedaluwarsa. Minta tautan baru.',
  config: 'Server belum dikonfigurasi. Isi variabel Supabase di Vercel lalu deploy ulang.',
};

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { error } = await searchParams;
  const message = typeof error === 'string' ? ERRORS[error] : undefined;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Hub Pribadi</h1>
        <p className="text-sm text-muted">Kuliah, riset, dan keuangan dalam satu tempat.</p>
      </div>
      {message && <p className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">{message}</p>}
      <div className="card">
        <LoginForm />
      </div>
      <p className="text-xs text-muted">Masuk tanpa kata sandi. Tautan dikirim ke email pemilik dan berlaku sekali pakai.</p>
    </main>
  );
}
