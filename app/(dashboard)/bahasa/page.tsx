import { BookOpenText, Check, Headphones, Library, Mic, MessageCircle, PenLine, type LucideIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BandCard } from '@/components/english/ielts/BandCard';
import { PageHeader, Section } from '@/components/ui/Section';
import { StatTile } from '@/components/ui/StatTile';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/data';
import { SESSION_STEPS, SKILLS, skillFor, topicByKey, type SessionStep } from '@/lib/english/ielts';
import { bandSummary, type Day } from '@/lib/english/ielts-store';
import { loadProfile, streakDays } from '@/lib/english/store';
import { addDays, diffDays, formatDateTimeId, isoWeekday, todayIso, zonedParts, zonedToIso } from '@/lib/time';
import { EnglishSettingsForm } from './EnglishSettingsForm';

export const metadata: Metadata = { title: 'Bahasa Inggris' };

const LEVEL: Record<string, string> = { beginner: 'pemula', intermediate: 'menengah', upper_intermediate: 'menengah atas' };
const KIND: Record<string, string> = { review: 'Review', reading: 'Reading', writing: 'Writing', speaking: 'Speaking', grammar: 'Grammar', listening: 'Listening' };
const STEP: Record<SessionStep, string> = { review: 'Review kartu', words: '5 kata baru', grammar: 'Grammar', skill: 'Skill tes' };

function Tile({ href, icon: Icon, label, sub }: { href: string; icon: LucideIcon; label: string; sub?: string }) {
  return (
    <Link href={href} className="card flex min-h-11 items-center gap-3 p-3 hover:border-accent">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong"><Icon size={20} strokeWidth={1.8} aria-hidden="true" /></span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{label}</span>
        {sub && <span className="block truncate text-[12px] text-muted">{sub}</span>}
      </span>
    </Link>
  );
}

/** Bahasa Inggris v2 (D-60): persiapan IELTS. Perkiraan band, sesi harian 15 menit, latihan per skill, laporan mingguan. */
export default async function BahasaPage() {
  await requireUser();
  const s = await db();
  const now = new Date();
  const today = todayIso(now);
  const weekStart = addDays(today, 1 - isoWeekday(today));
  const [profile, bands, { data: day }, { count: dueCount }, { count: total }, { data: reviews }, { data: sessions }, { data: patterns }, { data: week }] = await Promise.all([
    loadProfile(s),
    bandSummary(s, today),
    s.from('english_days').select('done,grammar_key,skill').eq('day', today).maybeSingle(),
    s.from('vocab').select('id', { count: 'exact', head: true }).lte('due_at', now.toISOString()),
    s.from('vocab').select('id', { count: 'exact', head: true }),
    s.from('vocab_reviews').select('created_at').gte('created_at', zonedToIso(addDays(today, -90))),
    s.from('practice_sessions').select('kind,summary,created_at').order('created_at', { ascending: false }).limit(60),
    s.from('mistake_patterns').select('pattern,count,example').order('count', { ascending: false }).limit(3),
    s.from('english_days').select('day,done,grammar_key,grammar_score').gte('day', weekStart).lte('day', today).order('day'),
  ]);
  const done = ((day as Pick<Day, 'done'> | null)?.done ?? {}) as Partial<Record<SessionStep, boolean>>;
  const skill = SKILLS[(day?.skill as keyof typeof SKILLS) ?? skillFor(today)];
  const doneCount = SESSION_STEPS.filter((x) => done[x]).length;
  const active = new Set([...(reviews ?? []).map((r) => zonedParts(r.created_at).date), ...(sessions ?? []).map((r) => zonedParts(r.created_at).date)]);
  const daysLeft = profile.testDate ? diffDays(profile.testDate, today) : null;
  const weekSessions = (sessions ?? []).filter((r) => zonedParts(r.created_at).date >= weekStart);
  const weekCount = (k: string) => weekSessions.filter((r) => r.kind === k).length;
  const fullDays = (week ?? []).filter((d) => SESSION_STEPS.every((x) => (d.done as Record<string, boolean>)[x])).length;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Bahasa Inggris" />
      <p className="-mt-2 text-[13px] text-muted">IELTS Academic · level {LEVEL[profile.level] ?? profile.level} · streak {streakDays(active, today, addDays)} hari</p>
      {profile.goal !== 'ielts' && (
        <p className="rounded-xl bg-warn-bg px-3 py-2 text-[13px] text-warn-fg">Tujuan di pengaturan masih &ldquo;{profile.goal}&rdquo;. Modul ini disusun untuk IELTS. Ubah tujuan ke IELTS di bawah supaya soal dan umpan balik Ra ikut menyesuaikan.</p>
      )}

      <BandCard s={bands} target={profile.targetBand} daysLeft={daysLeft} testDate={profile.testDate} />

      <section aria-label="Sesi hari ini" className="card flex flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="h-section">Sesi hari ini</h2>
          <span className="text-[12px] text-muted">{doneCount} dari 4 langkah</span>
        </div>
        <ul className="flex flex-col gap-1">
          {SESSION_STEPS.map((x) => (
            <li key={x} className="flex min-h-10 items-center gap-3 text-[14px]">
              <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${done[x] ? 'bg-accent-fill text-on-accent' : 'border-2 border-line'}`}>{done[x] && <Check size={14} aria-label="selesai" />}</span>
              <span className={done[x] ? 'text-muted' : 'font-semibold'}>
                {x === 'grammar' && day?.grammar_key ? `Grammar: ${topicByKey(day.grammar_key)?.title ?? ''}` : x === 'skill' ? skill.title : x === 'review' && dueCount && !done.review ? `${STEP[x]} (${dueCount})` : STEP[x]}
              </span>
            </li>
          ))}
        </ul>
        <Link href="/bahasa/sesi" className="btn btn-primary mt-1">{doneCount === 0 ? 'Mulai sesi 15 menit' : doneCount === 4 ? 'Buka lagi sesi hari ini' : 'Lanjutkan sesi'}</Link>
      </section>

      <Section title="Latihan per skill">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Tile href="/bahasa/ielts/reading" icon={BookOpenText} label="Reading" sub="Teks akademik + 6 soal, ada terjemahan" />
          <Tile href="/bahasa/ielts/writing?task=2" icon={PenLine} label="Writing" sub="Task 1 tabel, Task 2 esai" />
          <Tile href="/bahasa/ielts/speaking?part=2" icon={Mic} label="Speaking" sub="Part 1, cue card Part 2, Part 3" />
          <Tile href="/bahasa/ielts/listening" icon={Headphones} label="Listening" sub="Rekaman + soal, lalu transkrip dan terjemahan" />
        </div>
      </Section>

      <Section title="Alat lain">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Tile href="/bahasa/kata" icon={Library} label="Bank kata" sub={`${total ?? 0} kata`} />
          <Tile href="/bahasa/baca" icon={BookOpenText} label="Baca jurnal" sub="Bacaan riset dengan Ra" />
          <Tile href="/bahasa/bicara" icon={MessageCircle} label="Ngobrol bebas" sub="Percakapan suara dengan Ra" />
        </div>
      </Section>

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
        ) : <p className="card px-4 py-3 text-[13px] text-muted">Belum ada pola kesalahan. Writing, Speaking, dan English Mode akan mengisinya, lalu grammar harian memprioritaskannya.</p>}
      </Section>

      <section id="laporan" aria-label="Laporan minggu ini" className="flex scroll-mt-20 flex-col gap-2">
        <h2 className="h-section">Minggu ini</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatTile label="Sesi lengkap" value={fullDays} unit="hari" />
          <StatTile label="Reading" value={weekCount('reading')} />
          <StatTile label="Writing" value={weekCount('writing')} />
          <StatTile label="Speaking" value={weekCount('speaking')} />
        </div>
        {(week ?? []).some((d) => d.grammar_key) && (
          <p className="text-[13px] text-muted">
            Grammar: {(week ?? []).filter((d) => d.grammar_key).map((d) => `${topicByKey(d.grammar_key)?.title ?? d.grammar_key}${d.grammar_score != null ? ` (${d.grammar_score}/5)` : ''}`).join(' · ')}
          </p>
        )}
      </section>

      <Section title="Riwayat latihan">
        {sessions?.length ? (
          <ul className="card rows overflow-hidden">
            {sessions.slice(0, 8).map((r, idx) => (
              <li key={idx} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
                <span className="w-16 shrink-0 font-semibold">{KIND[r.kind] ?? r.kind}</span>
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
