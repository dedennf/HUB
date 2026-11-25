import { Bell } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyState, PageHeader, Section } from '@/components/ui/Section';
import { requireUser } from '@/lib/auth';
import { db, getSettings } from '@/lib/data';
import { formatDateTimeId } from '@/lib/time';
import { markAllNotificationsRead } from '../actions';
import { vapidProblem, vapidPublicKey } from '@/lib/notify/push';
import { PushControl } from './PushControl';
import { ScheduleForm } from './ScheduleForm';

export const metadata: Metadata = { title: 'Notifikasi' };
const hhmm = (v: unknown, d: string) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : d);

/** SPEC 9: lonceng (semua notifikasi tersimpan), push per perangkat, dan jadwal otomasi bawaan. */
export default async function NotifikasiPage() {
  await requireUser();
  const s = await db();
  const [settings, { data: list }, { count: devices }] = await Promise.all([
    getSettings(s, ['briefing_time', 'recap_time', 'quiet_hours', 'vocab_review_time', 'cron_last_tick']),
    s.from('notifications').select('id,title,body,url,created_at,read_at,deliver_after,sent_at').order('created_at', { ascending: false }).limit(50),
    s.from('push_subscriptions').select('id', { count: 'exact', head: true }),
  ]);
  const quiet = Array.isArray(settings.quiet_hours) ? settings.quiet_hours : ['22:30', '06:00'];
  const unread = (list ?? []).filter((n) => !n.read_at).length;
  const problem = vapidProblem();
  const tick = settings.cron_last_tick as { at?: string; errors?: string[] } | undefined;
  const nowMs = new Date().getTime();
  const tickAge = tick?.at ? (nowMs - new Date(tick.at).getTime()) / 60_000 : null;
  const cronOk = tickAge != null && tickAge < 20;
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Notifikasi" back={{ href: '/saya', label: 'Saya' }} />

      <Section title="Status">
        <ul className="card rows overflow-hidden text-[13px]">
          <li className="flex gap-3 px-4 py-3">
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${problem ? 'bg-danger-fg' : 'bg-positive'}`} aria-hidden="true" />
            <span><span className="font-semibold">Kunci push (VAPID): </span>{problem ?? 'siap.'}</span>
          </li>
          <li className="flex gap-3 px-4 py-3">
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${devices ? 'bg-positive' : 'bg-warn-fg'}`} aria-hidden="true" />
            <span><span className="font-semibold">Perangkat: </span>{devices ? `${devices} perangkat berlangganan.` : 'belum ada. Tekan Aktifkan notifikasi di bawah, di setiap perangkat.'}</span>
          </li>
          <li className="flex gap-3 px-4 py-3">
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${cronOk ? 'bg-positive' : 'bg-danger-fg'}`} aria-hidden="true" />
            <span>
              <span className="font-semibold">Penjadwal: </span>
              {tick?.at
                ? `terakhir jalan ${formatDateTimeId(tick.at)}.${cronOk ? '' : ' Seharusnya tiap 5 menit, jadi pengingat terjadwal tidak terkirim. Cek pg_cron di Supabase (docs/cron-setup.sql).'}`
                : 'belum pernah jalan. Pengingat terjadwal (briefing, tenggat, tagihan) tidak akan terkirim sampai docs/cron-setup.sql dijalankan di SQL Editor Supabase dan CRON_SECRET sama dengan di Vercel.'}
              {tick?.errors?.length ? <span className="mt-1 block text-danger-fg">Galat kirim terakhir: {tick.errors[0]}</span> : null}
            </span>
          </li>
        </ul>
      </Section>

      <Section title="Push di perangkat ini">
        <div className="card p-4">
          <PushControl vapidKey={vapidPublicKey()} />
          <p className="mt-3 text-[12px] text-muted">Aktifkan di laptop dan HP supaya keduanya menerima. Di Windows, pastikan notifikasi browser diizinkan di Settings, System, Notifications, dan mode Fokus mati.</p>
        </div>
      </Section>

      <Section title="Semua notifikasi" action={unread ? <form action={markAllNotificationsRead}><button className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent">Tandai dibaca ({unread})</button></form> : undefined}>
        {list?.length ? (
          <ul className="card rows overflow-hidden">
            {list.map((n) => (
              <li key={n.id}>
                <a href={n.url ?? '/'} className="flex gap-3 px-4 py-3 hover:bg-bg">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-accent'}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[14px] ${n.read_at ? '' : 'font-semibold'}`}>{n.title}{!n.read_at && <span className="sr-only"> (belum dibaca)</span>}</span>
                    {n.body && <span className="block whitespace-pre-line text-[13px] text-muted">{n.body}</span>}
                    <span className="mt-0.5 block text-[12px] text-muted">
                      {formatDateTimeId(n.created_at)}
                      {!n.sent_at && n.deliver_after ? ` · ditunda sampai ${formatDateTimeId(n.deliver_after)} (jam tenang)` : ''}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : <div className="card"><EmptyState><Bell size={20} strokeWidth={1.8} className="mx-auto mb-1" aria-hidden="true" />Belum ada notifikasi. Briefing pagi, pengingat tenggat, dan tagihan akan muncul di sini.</EmptyState></div>}
      </Section>

      <Section title="Jadwal">
        <div className="card p-4">
          <ScheduleForm v={{
            briefing: hhmm(settings.briefing_time, '06:30'), recap: hhmm(settings.recap_time, '21:00'), vocab: hhmm(settings.vocab_review_time, '19:30'),
            quietStart: hhmm(quiet[0], '22:30'), quietEnd: hhmm(quiet[1], '06:00'),
          }} />
        </div>
      </Section>
    </div>
  );
}
