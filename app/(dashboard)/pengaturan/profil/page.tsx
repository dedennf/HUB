import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/Section';
import { db, getSettings } from '@/lib/data';
import { readText } from '@/lib/settings';
import { ProfileForm } from './ProfileForm';

export const metadata: Metadata = { title: 'Profil' };

export default async function ProfilPage() {
  const s = await getSettings(await db(), ['profile_name', 'profile_program']);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Profil" back={{ href: '/saya', label: 'Saya' }} />
      <section className="card p-4"><ProfileForm name={readText(s.profile_name)} program={readText(s.profile_program)} /></section>
    </div>
  );
}
