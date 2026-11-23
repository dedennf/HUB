import type { Metadata } from 'next';
import { Chip } from '@/components/ui/Chip';
import { LiteratureRow } from '@/components/ui/LiteratureRow';
import { ProgressCard } from '@/components/ui/ProgressCard';
import { EmptyState, PageHeader, Section } from '@/components/ui/Section';
import {
  db, getReadings, getResearchIdeas, getResearchNeeds, getResearchProjects, getResearchTargets, getSupervisions,
} from '@/lib/data';
import { formatDayMonth, formatDayShort } from '@/lib/format';
import { daysUntouched, summarizeProject } from '@/lib/research';
import { todayIso } from '@/lib/time';

export const metadata: Metadata = { title: 'Riset' };

const NEED = { open: ['Belum', 'warn'], in_progress: ['Sedang diurus', 'info'], fulfilled: ['Terpenuhi', 'ok'] } as const;
const IDEA = { raw: ['Mentah', 'warn'], viable: ['Layak dikembangkan', 'ok'], discarded: ['Dibuang', 'neutral'] } as const;
const UNTOUCHED_DAYS = 4;

export default async function RisetPage() {
  const s = await db();
  const today = todayIso();
  const [projects, targets, needs, ideas, readings, supervisions] = await Promise.all([
    getResearchProjects(s), getResearchTargets(s), getResearchNeeds(s), getResearchIdeas(s), getReadings(s), getSupervisions(s),
  ]);
  const summary = summarizeProject(projects, targets, supervisions, today);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Riset" back={{ href: '/saya', label: 'Saya' }} />
      {summary ? (
        <ProgressCard title={summary.project.title} percent={summary.percent}
          detail={`${summary.done} dari ${summary.total} target${summary.nextSupervision ? ` · bimbingan berikutnya ${formatDayShort(summary.nextSupervision)}` : ''}`} />
      ) : <div className="card"><EmptyState>Belum ada proyek riset. Impor data lama atau tambahkan lewat Ra nanti.</EmptyState></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Target">
          {targets.length ? (
            <div className="card rows overflow-hidden">
              {targets.map((t) => {
                const idle = t.progress < 100 ? daysUntouched(t.last_touched_at ?? null, today) : null;
                return (
                  <div key={t.id} className="px-4 py-3">
                    <div className="flex justify-between gap-2 text-[14px]"><span className="font-semibold">{t.title}</span><span className="num font-bold">{t.progress}%</span></div>
                    <div className="mt-2 h-2 rounded-full bg-track" role="progressbar" aria-valuenow={t.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Progres ${t.title}`}>
                      <div className="h-2 rounded-full bg-accent" style={{ width: `${t.progress}%` }} />
                    </div>
                    <p className="mt-1 text-[12px] text-muted">
                      {t.due_date ? `Tenggat ${formatDayMonth(t.due_date)}` : 'Tanpa tenggat'}
                      {idle != null && idle > UNTOUCHED_DAYS && <span className="text-warn-fg"> · {idle} hari tidak disentuh</span>}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : <div className="card"><EmptyState>Belum ada target riset.</EmptyState></div>}
        </Section>
        <Section title="Literatur">
          {readings.length ? <div className="card rows overflow-hidden">{readings.map((r) => <LiteratureRow key={r.id} title={r.title} authors={r.authors} year={r.year} doi={r.doi} status={r.verification_status} />)}</div>
            : <div className="card"><EmptyState>Belum ada literatur. Tambahkan lewat Ra atau tombol + nanti.</EmptyState></div>}
        </Section>
        <Section title="Ide lanjutan">
          {ideas.length ? (
            <div className="card rows overflow-hidden">
              {ideas.map((i) => {
                const [label, tone] = IDEA[i.status as keyof typeof IDEA] ?? IDEA.raw;
                return <div key={i.id} className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-2.5"><span><span className="block text-[14px] font-semibold">{i.content}</span>{i.source && <span className="block text-[12px] text-muted">dari {i.source}</span>}</span><Chip tone={tone}>{label}</Chip></div>;
              })}
            </div>
          ) : <div className="card"><EmptyState>Belum ada ide.</EmptyState></div>}
        </Section>
        <Section title="Kebutuhan">
          {needs.length ? (
            <div className="card rows overflow-hidden">
              {needs.map((n) => {
                const [label, tone] = NEED[n.status as keyof typeof NEED] ?? NEED.open;
                return <div key={n.id} className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-2.5"><span><span className="block text-[14px] font-semibold">{n.item}</span>{n.kind && <span className="block text-[12px] text-muted">{n.kind}</span>}</span><Chip tone={tone}>{label}</Chip></div>;
              })}
            </div>
          ) : <div className="card"><EmptyState>Belum ada kebutuhan riset.</EmptyState></div>}
        </Section>
        <Section title="Bimbingan">
          {supervisions.length ? (
            <div className="card rows overflow-hidden">
              {supervisions.map((b) => (
                <div key={b.id} className="px-4 py-3">
                  <p className="text-[14px] font-semibold">{b.supervisor ?? 'Bimbingan'}{b.met_on ? <span className="font-normal text-muted"> · {formatDayMonth(b.met_on)}</span> : null}</p>
                  {b.points && <p className="text-[13px] text-muted">{b.points}</p>}
                  {b.next_on && <p className="text-[12px] text-accent">Berikutnya {formatDayShort(b.next_on)}</p>}
                </div>
              ))}
            </div>
          ) : <div className="card"><EmptyState>Belum ada catatan bimbingan.</EmptyState></div>}
        </Section>
      </div>
    </div>
  );
}
