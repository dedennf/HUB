import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DeleteButton } from '@/components/ui/DeleteButton';
import { EntityForm } from '@/components/ui/EntityForm';
import { PageHeader } from '@/components/ui/Section';
import { db } from '@/lib/data';
import { loadOptions } from '@/lib/entities/options';
import { getEntity } from '@/lib/entities/registry';
import { deleteEntity, saveEntity } from '../../actions';

export async function generateMetadata({ params }: PageProps<'/catat/[jenis]/[id]'>): Promise<Metadata> {
  const def = getEntity((await params).jenis);
  return { title: def ? `Ubah ${def.noun}` : 'Ubah' };
}

const safeBack = (v: unknown, fallback: string) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : fallback);

export default async function EditEntityPage({ params, searchParams }: PageProps<'/catat/[jenis]/[id]'>) {
  const { jenis, id } = await params;
  const def = getEntity(jenis);
  if (!def || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const back = safeBack((await searchParams).kembali, def.back);
  const s = await db();
  const { data: row } = await s.from(def.table).select('*').eq('id', id).maybeSingle();
  if (!row) notFound();
  const [options, extra] = await Promise.all([loadOptions(s, def), def.loadExtra ? def.loadExtra(s, id) : Promise.resolve({})]);
  const values = { ...(def.fromRow ? def.fromRow(row) : row), ...extra };
  const blocked = def.canDelete ? def.canDelete(row) : null;
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title={`Ubah ${def.noun}`} back={{ href: back, label: def.backLabel }} />
      <section className="card p-4">
        <EntityForm action={saveEntity.bind(null, def.key)} fields={def.fields} options={options} values={values} id={id} back={back} submitLabel="Simpan perubahan" />
      </section>
      <section className="card p-4">
        <h2 className="h-section mb-2">Hapus {def.noun}</h2>
        {blocked ? <p className="text-[13px] text-muted">{blocked}</p> : (
          <>
            {def.deleteNote && <p className="mb-3 text-[13px] text-muted">{def.deleteNote}</p>}
            <DeleteButton action={deleteEntity.bind(null, def.key)} id={id} back={back} label={`Hapus ${def.noun}`} confirmText={`Hapus ${def.noun} ini? Tindakan ini tidak bisa dibatalkan.`} />
          </>
        )}
      </section>
    </div>
  );
}
