import Link from 'next/link';
import type { Metadata } from 'next';
import { PageTitle } from '@/components/ui';
import { ImportClient } from './ImportClient';

export const metadata: Metadata = { title: 'Impor cadangan' };

export default function ImportPage() {
  return (
    <>
      <PageTitle title="Impor cadangan" kicker="Pengaturan" right={<Link href="/pengaturan" className="btn btn-sm">Kembali</Link>} />
      <ImportClient />
    </>
  );
}
