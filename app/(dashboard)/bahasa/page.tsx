import { BookOpenText, Library, Mic, PenLine, type LucideIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ReviewDeck, type ReviewCard } from '@/components/english/ReviewDeck';
import { PageHeader, Section } from '@/components/ui/Section';
import { StatTile } from '@/components/ui/StatTile';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/data';
import { loadProfile, streakDays } from '@/lib/english/store';
import { addDays, formatDateTimeId, todayIso, zonedParts, zonedToIso } from '@/lib/time';
import { EnglishSettingsForm } from './EnglishSettingsForm';

export const metadata: Metadata = { title: 'Bahasa Inggris' };

const LEVEL: Record<string, string> = { beginner: 'pemula', intermediate: 'menengah', upper_intermediate: 'menengah atas' };
const GOAL: Record<string, string> = { academic_general: 'Akademik + umum', toefl: 'TOEFL', ielts: 'IELTS', conversation: 'Percakapan', career: 'Karier' };
const SOURCE: Record<string, string> = { reading: 'dari bacaan', mistake: 'dari kesalahan tulisan', agent: 'dari Ra', manual: 'tambahan sendiri' };
const KIND: Record<string, string> = { review: 'Review', reading: 'Baca', writing: 'Tulis', speaking: 'Bicara' };

function Quick({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} className="flex min-h-11 flex-col items-center gap-1.5 text-[12px] text-fg">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface text-accent"><Icon size={22} strokeWidth={1.8} aria-hidden="true" /></span>
      {label}
    </Link>
  );
}

/** SPEC 10.3: ringkasan, review kartu, tombol cepat, pola kesalahan, riwayat sesi (mockup Bahasa.dc.html). */
export default async function BahasaPage() {
  await requireUser();
  const s = await db();
  const now = new Date();
  const today = todayIso(now);
  const [profile, { data: due, count: dueCount }, { count: total }, { count: mastered }, { data: reviews }, { data: sessions }, { data: patterns }] = await Promise.all([
    loadProfile(s),
    s.from('vocab').select('id,term,meaning_id,definition_en,example,part_of_speech,source_type', { count: 'exact' }).lte('due_at', now.toISOString()).order('due_at').limit(20),
    s.from('vocab').select('id', { count: 'exact', head: true }),
    s.from('vocab').select('id', { count: 'exact', head: true }).gte('interval_days', 21),
    s.from('vocab_reviews').select('created_at').gte('created_at', zonedToIso(addDays(today, -90))),
    s.from('practice_sessions').select('kind,summary,created_at,duration_seconds').order('created_at', { ascending: false }).limit(60),
    s.from('mistake_patterns').select('pattern,count,example').order('count', { ascending: false }).limit(3),
  ]);
  const active = new Set([...(reviews ?? []).map((r) => zonedParts(r.created_at).date), ...(sessions ?? []).map((r) => zonedParts(r.created_at).date)]);
  const reviewedToday = (reviews ?? []).filter((r) => zonedParts(r.created_at).date === today).length;
  const cards: ReviewCard[] = (due ?? []).map((v) => ({ ...v, source: v.source_type ? SOURCE[v.source_type] ?? null : null }));

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Bahasa Inggris" back={{ href: '/saya', label: 'Saya' }} />
      <p className="-mt-2 text-[13px] text-muted">{GOAL[profile.goal] ?? profile.goal} · {LEVEL[profile.level] ?? profile.level} · target {profile.dailyMinutes} menit sehari</p>

      <div className="grid grid-cols-3 gap-2.5">
        <StatTile label="Streak" value={streakDays(active, today, addDays)} unit="hari" />
        <StatTile label="Diulang hari ini" value={reviewedToday} />
        <StatTile label="Dikuasai" value={mastered ?? 0} />
      </div>

      <Section title={`Review${dueCount ? ` (${dueCount} jatuh tempo)` : ''}`} href="/bahasa/kata" linkLabel={`Bank kata (${total ?? 0})`}>
        <ReviewDeck cards={cards} />
      </Section>

      <nav aria-label="Latihan" className="grid grid-cols-4 gap-2">
        <Quick href="/bahasa/baca" icon={BookOpenText} label="Baca jurnal" />
        <Quick href="/bahasa/tulis" icon={PenLine} label="Tulis" />
        <Quick href="/bahasa/bicara" icon={Mic} label="Bicara" />
        <Quick href="/bahasa/kata" icon={Library} label="Bank kata" />
      </nav>

      <Section title="Kesalahan yang paling sering">
        {patterns?.length ? (
          <ul className="card rows overflow-hidden">
            {patterns.map((p) => (
              <li key={p.pattern} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold first-letter:uppercase" lang="en">{p.pattern}</span>
                  {p.example && <span className="block truncate text-[12px] text-muted" lang="en">{p.example}</span>}
                </span>
                <span className="num text-[14px] font-bold text-muted">{p.count}×</span>
              </li>
            ))}
          </ul>
        ) : <p className="card px-4 py-3 text-[13px] text-muted">Belum ada pola kesalahan. Koreksi tulisan dan latihan bicara akan mengisinya.</p>}
      </Section>

      <Section title="Riwayat latihan">
        {sessions?.length ? (
          <ul className="card rows overflow-hidden">
            {sessions.slice(0, 8).map((r, idx) => (
              <li key={idx} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
                <span className="w-14 shrink-0 font-semibold">{KIND[r.kind] ?? r.kind}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{r.summary ?? ''}</span>
                <span className="shrink-0 text-[12px] text-muted">{formatDateTimeId(r.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="card px-4 py-3 text-[13px] text-muted">Belum ada sesi latihan.</p>}
      </Section>

      <Section title="Pengaturan bahasa">
        <div className="card p-4"><EnglishSettingsForm v={profile} /></div>
      </Section>
    </div>
  );
}
