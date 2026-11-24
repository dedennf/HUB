import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EntityForm } from '@/components/ui/EntityForm';
import { PageHeader } from '@/components/ui/Section';
import { db } from '@/lib/data';
import { loadOptions } from '@/lib/entities/options';
import { getEntity, type FormValues } from '@/lib/entities/registry';
import { saveEntity } from '../actions';

export async function generateMetadata({ params }: PageProps<'/catat/[jenis]'>): Promise<Metadata> {
  const def = getEntity((await params).jenis);
  return { title: def ? `Tambah ${def.noun}` : 'Catat' };
}

const safeBack = (v: unknown, fallback: string) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : fallback);

/** Tambah data baru. Query string boleh mengisi nilai awal, mis. /catat/jadwal?course_id=... */
export default async function NewEntityPage({ params, searchParams }: PageProps<'/catat/[jenis]'>) {
  const def = getEntity((await params).jenis);
  if (!def) notFound();
  const sp = await searchParams;
  const back = safeBack(sp.kembali, def.back);
  const prefill: FormValues = {};
  for (const fld of def.fields) {
    const v = sp[fld.name];
    if (typeof v === 'string') prefill[fld.name] = fld.type === 'checkbox' ? v === '1' : v;
  }
  const options = await loadOptions(await db(), def);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title={`Tambah ${def.noun}`} back={{ href: back, label: def.backLabel }} />
      <section className="card p-4">
        <EntityForm action={saveEntity.bind(null, def.key)} fields={def.fields} options={options} values={{ ...def.defaults, ...prefill }} back={back} submitLabel="Simpan" />
      </section>
    </div>
  );
}
