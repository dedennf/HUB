import type { Metadata } from 'next';
import { DailySession } from '@/components/english/ielts/DailySession';
import type { ReviewCard } from '@/components/english/ReviewDeck';
import { PageHeader } from '@/components/ui/Section';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/data';
import { ensureDay, markStep } from '@/lib/english/ielts-store';
import { loadProfile } from '@/lib/english/store';
import { formatDateId, todayIso } from '@/lib/time';

export const metadata: Metadata = { title: 'Sesi hari ini' };
const SOURCE: Record<string, string> = { reading: 'dari bacaan', mistake: 'dari kesalahan tulisan', agent: 'dari Ra', manual: 'tambahan sendiri', daily: 'kata harian' };

export default async function SesiPage() {
  await requireUser();
  const s = await db();
  const now = new Date();
  const today = todayIso(now);
  const profile = await loadProfile(s);
  const [day, { data: due }] = await Promise.all([
    ensureDay(s, today, profile),
    // dibatasi 15 kartu supaya review muat di sekitar 3 menit
    s.from('vocab').select('id,term,meaning_id,definition_en,example,part_of_speech,source_type').lte('due_at', now.toISOString()).order('due_at').limit(15),
  ]);
  const cards: ReviewCard[] = (due ?? []).map((v) => ({ ...v, source: v.source_type ? SOURCE[v.source_type] ?? null : null }));
  // tidak ada kartu jatuh tempo: langkah review otomatis selesai
  if (!cards.length && !day.done.review) {
    await markStep(s, today, 'review');
    day.done = { ...day.done, review: true };
  }
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Sesi hari ini" back={{ href: '/bahasa', label: 'Bahasa' }} />
      <p className="-mt-2 text-[13px] text-muted">{formatDateId(today, { weekday: 'long', day: 'numeric', month: 'long' })} · sekitar 15 menit</p>
      <DailySession cards={cards} done={day.done} skill={day.skill} />
    </div>
  );
}
