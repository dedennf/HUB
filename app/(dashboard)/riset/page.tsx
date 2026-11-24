import type { Metadata } from 'next';
import Link from 'next/link';
import { Chip } from '@/components/ui/Chip';
import { LiteratureRow } from '@/components/ui/LiteratureRow';
import { ProgressCard } from '@/components/ui/ProgressCard';
import { AddButton, EmptyState, PageHeader, Section } from '@/components/ui/Section';
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
const K = '?kembali=/riset';
const row = 'flex min-h-[56px] items-center justify-between gap-3 px-4 py-2.5 hover:bg-bg';

export default async function RisetPage() {
  const s = await db();
  const today = todayIso();
  const [projects, targets, needs, ideas, readings, supervisions] = await Promise.all([
    getResearchProjects(s), getResearchTargets(s), getResearchNeeds(s), getResearchIdeas(s), getReadings(s), getSupervisions(s),
  ]);
  const summary = summarizeProject(projects, targets, supervisions, today);
  const pid = summary ? `&project_id=${summary.project.id}` : '';

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Riset" back={{ href: '/saya', label: 'Saya' }} right={<AddButton href={`/catat/proyek${K}`} label="Tambah proyek riset" />} />
      {summary ? (
        <ProgressCard title={summary.project.title} percent={summary.percent} href={`/catat/proyek/${summary.project.id}${K}`}
          detail={`${summary.done} dari ${summary.total} target${summary.nextSupervision ? ` · bimbingan berikutnya ${formatDayShort(summary.nextSupervision)}` : ''}`} />
      ) : <div className="card"><EmptyState>Belum ada proyek riset. Tekan + untuk membuat proyek, misalnya &quot;Skripsi&quot;.</EmptyState></div>}
      {projects.length > 1 && (
        <p className="px-1 text-[12px] text-muted">Proyek lain: {projects.filter((p) => p.id !== summary?.project.id).map((p, i) => (
          <span key={p.id}>{i > 0 && ', '}<Link href={`/catat/proyek/${p.id}${K}`} className="font-semibold text-accent">{p.title}</Link></span>
        ))}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Target" add={{ href: `/catat/target${K}${pid}`, label: 'Tambah target riset' }}>
          {targets.length ? (
            <div className="card rows overflow-hidden">
              {targets.map((t) => {
                const idle = t.progress < 100 ? daysUntouched(t.last_touched_at ?? null, today) : null;
                return (
                  <Link key={t.id} href={`/catat/target/${t.id}${K}`} className="block px-4 py-3 hover:bg-bg">
                    <span className="flex justify-between gap-2 text-[14px]"><span className="font-semibold">{t.title}</span><span className="num font-bold">{t.progress}%</span></span>
                    <span className="mt-2 block h-2 rounded-full bg-track" role="progressbar" aria-valuenow={t.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Progres ${t.title}`}>
                      <span className="block h-2 rounded-full bg-accent" style={{ width: `${t.progress}%` }} />
                    </span>
                    <span className="mt-1 block text-[12px] text-muted">
                      {t.due_date ? `Tenggat ${formatDayMonth(t.due_date)}` : 'Tanpa tenggat'}
                      {idle != null && idle > UNTOUCHED_DAYS && <span className="text-warn-fg"> · {idle} hari tidak disentuh</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : <div className="card"><EmptyState>Belum ada target riset.</EmptyState></div>}
        </Section>
        <Section title="Literatur" add={{ href: `/catat/literatur${K}${pid}`, label: 'Tambah literatur' }}>
          {readings.length ? <div className="card rows overflow-hidden">{readings.map((r) => <LiteratureRow key={r.id} title={r.title} authors={r.authors} year={r.year} doi={r.doi} status={r.verification_status} href={`/catat/literatur/${r.id}${K}`} />)}</div>
            : <div className="card"><EmptyState>Belum ada literatur. Tekan + untuk menambah.</EmptyState></div>}
        </Section>
        <Section title="Ide lanjutan" add={{ href: `/catat/ide${K}${pid}`, label: 'Tambah ide riset' }}>
          {ideas.length ? (
            <div className="card rows overflow-hidden">
              {ideas.map((i) => {
                const [label, tone] = IDEA[i.status as keyof typeof IDEA] ?? IDEA.raw;
                return <Link key={i.id} href={`/catat/ide/${i.id}${K}`} className={row}><span><span className="block text-[14px] font-semibold">{i.content}</span>{i.source && <span className="block text-[12px] text-muted">dari {i.source}</span>}</span><Chip tone={tone}>{label}</Chip></Link>;
              })}
            </div>
          ) : <div className="card"><EmptyState>Belum ada ide.</EmptyState></div>}
        </Section>
        <Section title="Kebutuhan" add={{ href: `/catat/kebutuhan${K}${pid}`, label: 'Tambah kebutuhan riset' }}>
          {needs.length ? (
            <div className="card rows overflow-hidden">
              {needs.map((n) => {
                const [label, tone] = NEED[n.status as keyof typeof NEED] ?? NEED.open;
                return <Link key={n.id} href={`/catat/kebutuhan/${n.id}${K}`} className={row}><span><span className="block text-[14px] font-semibold">{n.item}</span>{n.kind && <span className="block text-[12px] text-muted">{n.kind}</span>}</span><Chip tone={tone}>{label}</Chip></Link>;
              })}
            </div>
          ) : <div className="card"><EmptyState>Belum ada kebutuhan riset.</EmptyState></div>}
        </Section>
        <Section title="Bimbingan" add={{ href: `/catat/bimbingan${K}&met_on=${today}`, label: 'Tambah catatan bimbingan' }}>
          {supervisions.length ? (
            <div className="card rows overflow-hidden">
              {supervisions.map((b) => (
                <Link key={b.id} href={`/catat/bimbingan/${b.id}${K}`} className="block px-4 py-3 hover:bg-bg">
                  <span className="block text-[14px] font-semibold">{b.supervisor ?? 'Bimbingan'}{b.met_on ? <span className="font-normal text-muted"> · {formatDayMonth(b.met_on)}</span> : null}</span>
                  {b.points && <span className="block text-[13px] text-muted">{b.points}</span>}
                  {b.next_on && <span className="block text-[12px] text-accent">Berikutnya {formatDayShort(b.next_on)}</span>}
                </Link>
              ))}
            </div>
          ) : <div className="card"><EmptyState>Belum ada catatan bimbingan.</EmptyState></div>}
        </Section>
      </div>
    </div>
  );
}
