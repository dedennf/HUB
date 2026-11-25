import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/Section';
import { requireUser } from '@/lib/auth';
import { PasswordForm } from './PasswordForm';

export const metadata: Metadata = { title: 'Kata sandi' };

export default async function KataSandiPage() {
  const user = await requireUser();
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Kata sandi" back={{ href: '/pengaturan', label: 'Pengaturan' }} />
      <p className="text-[13px] text-muted">
        Dengan kata sandi, kamu bisa masuk di app yang terpasang di laptop atau HP tanpa membuka email.
        Email masuknya tetap <b className="text-fg">{user.email}</b>. Minimal 8 karakter.
      </p>
      <section className="card p-4"><PasswordForm /></section>
    </div>
  );
}
