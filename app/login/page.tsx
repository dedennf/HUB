import type { Metadata } from 'next';
import Image from 'next/image';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Masuk' };

const ERRORS: Record<string, string> = {
  not_owner: 'Akun ini tidak punya akses ke Kompas. Masuk dengan email pemilik (sama dengan OWNER_EMAIL di server).',
  link: 'Tautan masuk tidak valid atau sudah kedaluwarsa. Minta tautan baru.',
  config: 'Server belum dikonfigurasi. Isi variabel Supabase di Vercel lalu deploy ulang.',
};

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { error } = await searchParams;
  const message = typeof error === 'string' ? ERRORS[error] : undefined;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-5">
      <div className="flex flex-col items-start gap-4">
        <Image src="/brand/kompas-icon.svg" alt="" width={64} height={64} priority />
        <div>
          <h1 className="font-display text-[28px] font-extrabold tracking-tight">kompas</h1>
          <p className="text-[14px] text-muted">Kuliah, riset, dan keuangan dalam satu tempat, bersama Ra.</p>
        </div>
      </div>
      {message && <p role="alert" className="rounded-xl bg-danger-bg p-3 text-[13px] text-danger-fg">{message}</p>}
      <div className="card p-4"><LoginForm /></div>
      <p className="text-[12px] text-muted">Masuk tanpa kata sandi. Tautan dikirim ke email pemilik dan berlaku sekali pakai.</p>
    </main>
  );
}
