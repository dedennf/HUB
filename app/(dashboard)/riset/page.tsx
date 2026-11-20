import type { Metadata } from 'next';
import { Empty, PageTitle, Section } from '@/components/ui';
import { db, getReadings, getResearchIdeas, getResearchNeeds, getResearchProjects, getResearchTargets, getSupervisions } from '@/lib/data';
import { formatDateId } from '@/lib/time';

export const metadata: Metadata = { title: 'Riset' };

const NEED = { open: 'Belum', in_progress: 'Sedang diurus', fulfilled: 'Terpenuhi' } as Record<string, string>;
const IDEA = { raw: 'Mentah', viable: 'Layak dikembangkan', discarded: 'Dibuang' } as Record<string, string>;
const LIT = { unchecked: 'Belum dicek', doi_checked: 'DOI dicek', page_checked: 'Halaman dicek', fulltext_read: 'Teks lengkap dibaca' } as Record<string, string>;

export default async function RisetPage() {
  const s = await db();
  const [projects, targets, needs, ideas, readings, supervisions] = await Promise.all([
    getResearchProjects(s), getResearchTargets(s), getResearchNeeds(s), getResearchIdeas(s), getReadings(s), getSupervisions(s),
  ]);
  return (
    <>
      <PageTitle title="Riset" kicker={projects.map((p) => p.title).join(' · ') || 'Belum ada proyek'} />
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Target dan progres">
          {targets.length ? targets.map((t) => (
            <div key={t.id} className="py-2">
              <div className="flex justify-between text-sm"><span>{t.title}</span><span className="text-muted">{t.progress}%</span></div>
              <div className="mt-1 h-2 rounded-full bg-line"><div className="h-2 rounded-full bg-accent" style={{ width: `${t.progress}%` }} /></div>
              {t.due_date && <div className="mt-1 text-xs text-muted">Tenggat {formatDateId(t.due_date)}</div>}
            </div>
          )) : <Empty>Belum ada target riset.</Empty>}
        </Section>
        <Section title="Ide lanjutan">
          {ideas.length ? <div className="list">{ideas.map((i) => (
            <div key={i.id} className="row"><span>{i.content}{i.source ? <span className="block text-xs text-muted">dari {i.source}</span> : null}</span><span className="chip">{IDEA[i.status]}</span></div>
          ))}</div> : <Empty>Belum ada ide.</Empty>}
        </Section>
        <Section title="Kebutuhan">
          {needs.length ? <div className="list">{needs.map((n) => (
            <div key={n.id} className="row"><span>{n.item}{n.kind ? <span className="block text-xs text-muted">{n.kind}</span> : null}</span><span className="chip">{NEED[n.status]}</span></div>
          ))}</div> : <Empty>Belum ada kebutuhan.</Empty>}
        </Section>
        <Section title="Literatur">
          {readings.length ? <div className="list">{readings.map((r) => (
            <div key={r.id} className="row">
              <span>{r.title}<span className="block text-xs text-muted">{[r.authors, r.year].filter(Boolean).join(', ')}{r.doi ? <> · <a className="underline" href={`https://doi.org/${encodeURI(r.doi)}`} target="_blank" rel="noopener noreferrer">{r.doi}</a></> : null}</span></span>
              <span className="chip">{LIT[r.verification_status]}</span>
            </div>
          ))}</div> : <Empty>Belum ada literatur.</Empty>}
        </Section>
        <Section title="Bimbingan">
          {supervisions.length ? <div className="list">{supervisions.map((b) => (
            <div key={b.id} className="row"><span>{b.supervisor ?? 'Bimbingan'}<span className="block text-xs text-muted">{b.points}</span></span><span className="text-xs text-muted">{b.met_on ? formatDateId(b.met_on) : ''}{b.next_on ? ` · berikutnya ${formatDateId(b.next_on)}` : ''}</span></div>
          ))}</div> : <Empty>Belum ada catatan bimbingan.</Empty>}
        </Section>
      </div>
    </>
  );
}
