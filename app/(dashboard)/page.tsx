import { Bell } from 'lucide-react';
import Link from 'next/link';
import { BriefingCard, type BriefingItem } from '@/components/ui/BriefingCard';
import { Chip } from '@/components/ui/Chip';
import { MoneyChart } from '@/components/ui/MoneyChart';
import { MoneyHero } from '@/components/ui/MoneyHero';
import { ProgressCard } from '@/components/ui/ProgressCard';
import { ProposalBanner } from '@/components/ui/ProposalBanner';
import { QuickActions } from '@/components/ui/QuickActions';
import { EmptyState } from '@/components/ui/Section';
import { buildCalendarItems } from '@/lib/calendar';
import {
  countDueVocab, countProposedActions, countUnreadNotifications, db, getAccounts, getCalendarSources, getCourses, getDebts,
  getInvestments, getResearchProjects, getSettings, getTransactionsSince,
} from '@/lib/data';
import { netWorth, netWorthChangeThisMonth, RANGES, readyMoney, readyMoneySeries, type RangeKey } from '@/lib/finance';
import { formatDayShort, formatRpShort, formatTime, greeting } from '@/lib/format';
import { summarizeProject } from '@/lib/research';
import { readText } from '@/lib/settings';
import { dueChip, dueText } from '@/lib/tasks';
import { addDays, diffDays, todayIso, zonedParts } from '@/lib/time';

export default async function BerandaPage() {
  const now = new Date();
  const today = todayIso(now);
  const s = await db();
  const [accounts, investments, debts, sources, courses, txs, projects, proposals, unread, dueVocab, settings] = await Promise.all([
    getAccounts(s), getInvestments(s), getDebts(s), getCalendarSources(s), getCourses(s), getTransactionsSince(s, addDays(today, -365)),
    getResearchProjects(s), countProposedActions(s), countUnreadNotifications(s), countDueVocab(s), getSettings(s, ['profile_name']),
  ]);

  const ready = readyMoney(accounts);
  const worth = netWorth(accounts, investments, debts);
  const monthTxs = txs.filter((t) => zonedParts(t.occurred_at).date >= `${today.slice(0, 7)}-01`);
  const change = netWorthChangeThisMonth(worth, accounts, monthTxs);
  const series = Object.fromEntries(
    RANGES.map((r) => [r.key, readyMoneySeries(accounts, txs, addDays(today, -(r.days - 1)), today)?.map((p) => p.value) ?? null]),
  ) as Record<RangeKey, number[] | null>;

  const courseName = new Map(courses.map((c) => [c.id, c.name]));
  const todayItems = buildCalendarItems(sources, today, today).get(today) ?? [];
  const openTasks = sources.tasks.filter((t) => t.status !== 'done' && !t.parent_id && t.due_at);
  const overdue = openTasks.filter((t) => zonedParts(t.due_at!).date < today);
  const soon = openTasks.filter((t) => { const d = zonedParts(t.due_at!).date; return d >= today && d <= addDays(today, 1); });
  const bills = sources.bills.filter((b) => b.is_active && b.next_due_date && b.next_due_date <= addDays(today, 3));

  const items: BriefingItem[] = [
    ...todayItems.filter((i) => i.type === 'kelas').map((i, k) => ({ key: `k${k}`, color: 'class' as const, text: `Kuliah ${formatTime(i.time)} · ${i.title}` })),
    ...todayItems.filter((i) => i.type === 'acara').map((i, k) => ({ key: `a${k}`, color: 'event' as const, text: `${i.time ? `${formatTime(i.time)} · ` : ''}${i.title}` })),
    ...(overdue.length ? [{ key: 'late', color: 'task' as const, text: `${overdue.length} tugas lewat tenggat`, action: { label: 'Lihat', href: '/kalender' } }] : []),
    ...soon.map((t) => ({ key: t.id, color: 'task' as const, text: `${t.title} tenggat ${dueText(t.due_at!, today)}` })),
    ...bills.map((b) => {
      const d = diffDays(b.next_due_date!, today);
      const when = d < 0 ? `lewat ${-d} hari` : d === 0 ? 'jatuh tempo hari ini' : `jatuh tempo ${d} hari lagi`;
      return { key: b.id, color: 'bill' as const, text: `${b.name} ${formatRpShort(b.amount)} ${when}`, action: { label: 'Bayar', href: '/keuangan?tab=rencana' } };
    }),
    ...(dueVocab > 0 ? [{ key: 'vocab', color: 'study' as const, text: `${dueVocab} kosakata siap diulang`, action: { label: 'Ulang', href: '/bahasa' } }] : []),
  ];

  const upcoming = openTasks.filter((t) => zonedParts(t.due_at!).date >= today).sort((a, b) => a.due_at!.localeCompare(b.due_at!)).slice(0, 3);
  const research = summarizeProject(projects, sources.targets, sources.supervisions, today);
  const name = readText(settings.profile_name);
  const hello = `${greeting(Number(zonedParts(now).time.slice(0, 2)))}${name ? `, ${name}` : ''}`;

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted">{formatDayShort(today)}</p>
          <h1 className="font-display text-[18px] font-bold lg:text-[26px] lg:font-extrabold">{hello}</h1>
        </div>
        <Link href="/pengaturan/notifikasi" aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}
          className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface">
          <Bell size={20} strokeWidth={1.8} aria-hidden="true" />
          {unread > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-negative" aria-hidden="true" />}
        </Link>
      </header>

      <section aria-label="Ringkasan uang" className="lg:grid lg:rounded-[18px] lg:border lg:border-card-line lg:bg-surface lg:shadow-card lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-end lg:gap-8 lg:p-6">
        <MoneyHero ready={ready} netWorth={worth} change={change} />
        <MoneyChart series={series} className="mt-3 lg:mt-0" />
      </section>

      <div className="lg:hidden"><QuickActions /></div>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <BriefingCard title="Hari ini" items={items} />
        <section className="card hidden p-4 lg:block" aria-label="Tenggat terdekat">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="h-section">Tenggat terdekat</h2>
            <Link href="/kalender" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent">Kalender</Link>
          </div>
          {upcoming.length ? (
            <ul className="rows">
              {upcoming.map((t) => {
                const chip = dueChip(t.due_at, today)!;
                return (
                  <li key={t.id} className="flex min-h-11 items-center justify-between gap-3 py-2">
                    <span className="min-w-0"><span className="block truncate text-[14px] font-semibold">{t.title}</span><span className="block text-[12px] text-muted">{courseName.get(t.course_id ?? '') ?? 'Umum'}</span></span>
                    <Chip tone={chip.tone}>{chip.label}</Chip>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState>Tidak ada tenggat mendatang.</EmptyState>}
        </section>
      </div>

      <ProposalBanner count={proposals} href="/pengaturan/memori" />

      {research && (
        <div className="hidden lg:block">
          <ProgressCard title={research.project.title} percent={research.percent} href="/riset"
            detail={`${research.done} dari ${research.total} target${research.nextSupervision ? ` · bimbingan berikutnya ${formatDayShort(research.nextSupervision)}` : ''}`} />
        </div>
      )}

      {!accounts.length && !courses.length && (
        <div className="card p-4 text-[13px]">
          <p className="font-semibold">Selamat datang di Kompas</p>
          <p className="text-muted">Pindahkan data dari app lama lewat <Link href="/pengaturan/impor" className="font-semibold text-accent">Cadangan & impor</Link>, atau mulai dengan menambah akun di Uang.</p>
        </div>
      )}
    </div>
  );
}
