import Link from 'next/link';
import { Empty, Money, PageTitle, Section } from '@/components/ui';
import { buildCalendarItems, CALENDAR_TYPES } from '@/lib/calendar';
import { db, getAccounts, getCalendarSources, getCourses, getDebts } from '@/lib/data';
import { addDays, formatDateId, relativeDay, todayIso, zonedParts } from '@/lib/time';

export default async function BerandaPage() {
  const today = todayIso();
  const s = await db();
  const [accounts, sources, courses, debts] = await Promise.all([getAccounts(s), getCalendarSources(s), getCourses(s), getDebts(s)]);
  const active = accounts.filter((a) => !a.is_archived);
  const total = active.reduce((n, a) => n + a.balance, 0);
  const agenda = buildCalendarItems(sources, today, today).get(today) ?? [];
  const course = new Map(courses.map((c) => [c.id, c.name]));
  const openTasks = sources.tasks.filter((t) => t.status !== 'done' && t.due_at && !t.parent_id);
  const overdue = openTasks.filter((t) => zonedParts(t.due_at!).date < today);
  const soon = openTasks.filter((t) => { const d = zonedParts(t.due_at!).date; return d >= today && d <= addDays(today, 7); });
  const bills = sources.bills.filter((b) => b.is_active && b.next_due_date && b.next_due_date <= addDays(today, 14));
  const receivable = debts.filter((d) => d.direction === 'receivable').reduce((n, d) => n + d.amount - d.paid_amount, 0);
  const payable = debts.filter((d) => d.direction === 'payable').reduce((n, d) => n + d.amount - d.paid_amount, 0);
  const empty = !accounts.length && !courses.length;

  return (
    <>
      <PageTitle title="Beranda" kicker={formatDateId(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />
      {empty && (
        <div className="card mb-4">
          <p className="font-medium">Data masih kosong.</p>
          <p className="text-sm text-muted">Pindahkan data dari app lama lewat <Link className="text-accent underline" href="/pengaturan/impor">Pengaturan, Impor cadangan</Link>, atau mulai dengan menambah akun di Keuangan.</p>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-4">
          <Section title="Hari ini" action={<Link href="/kalender" className="btn btn-sm">Kalender</Link>}>
            {overdue.length > 0 && <p className="mb-2 rounded-lg bg-danger/10 p-2 text-sm text-danger">{overdue.length} tugas lewat tenggat.</p>}
            {agenda.length ? (
              <div className="list">
                {agenda.map((i, k) => (
                  <div key={k} className="row">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: i.color }} />
                      <span className="truncate">{i.title}{i.subtitle ? <span className="text-xs text-muted"> · {i.subtitle}</span> : null}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">{i.time ? `${i.time}${i.endTime ? `–${i.endTime}` : ''}` : CALENDAR_TYPES[i.type].label}</span>
                  </div>
                ))}
              </div>
            ) : <Empty>Tidak ada agenda hari ini.</Empty>}
          </Section>
          <Section title="Tenggat 7 hari ke depan" action={<Link href="/kuliah" className="btn btn-sm">Tugas</Link>}>
            {soon.length ? (
              <div className="list">
                {soon.map((t) => {
                  const d = zonedParts(t.due_at!).date;
                  return (
                    <div key={t.id} className="row">
                      <span>{t.title}<span className="block text-xs text-muted">{course.get(t.course_id ?? '') ?? 'Umum'}</span></span>
                      <span className="text-xs text-muted">{formatDateId(d)} · {relativeDay(d, today)}</span>
                    </div>
                  );
                })}
              </div>
            ) : <Empty>Tidak ada tenggat dalam seminggu ini.</Empty>}
          </Section>
        </div>
        <div className="grid content-start gap-4">
          <Section title="Uang" action={<Link href="/keuangan" className="btn btn-sm">Keuangan</Link>}>
            <div className="text-2xl font-semibold"><Money value={total} /></div>
            <div className="mb-2 text-xs text-muted">Total saldo {active.length} akun</div>
            <div className="list">
              {active.map((a) => <div key={a.id} className="row text-sm"><span>{a.name}</span><Money value={a.balance} signed /></div>)}
            </div>
            {(receivable > 0 || payable > 0) && (
              <p className="mt-2 text-xs text-muted">Piutang <Money value={receivable} /> · Utang <Money value={payable} /></p>
            )}
          </Section>
          <Section title="Tagihan 14 hari">
            {bills.length ? (
              <div className="list">
                {bills.map((b) => (
                  <div key={b.id} className="row">
                    <span>{b.name}<span className="block text-xs text-muted">{formatDateId(b.next_due_date!)} · {relativeDay(b.next_due_date!, today)}</span></span>
                    <Money value={b.amount} />
                  </div>
                ))}
              </div>
            ) : <Empty>Tidak ada tagihan dalam dua minggu.</Empty>}
          </Section>
        </div>
      </div>
    </>
  );
}
