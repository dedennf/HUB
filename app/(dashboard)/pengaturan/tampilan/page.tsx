import type { Metadata } from 'next';
import { PageHeader, Section } from '@/components/ui/Section';
import { db, getSettings } from '@/lib/data';
import { readTheme } from '@/lib/settings';
import { PrivacySetting } from './PrivacySetting';
import { ThemePicker } from './ThemePicker';

export const metadata: Metadata = { title: 'Tampilan' };

export default async function TampilanPage() {
  const s = await getSettings(await db(), ['theme']);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Tampilan" back={{ href: '/saya', label: 'Saya' }} />
      <Section title="Tema"><ThemePicker current={readTheme(s.theme)} /></Section>
      <Section title="Privasi"><PrivacySetting /></Section>
    </div>
  );
}
