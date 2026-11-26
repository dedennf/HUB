import Link from 'next/link';
import { SESSION_STEPS, SKILLS, type SessionStep, type Skill } from '@/lib/english/ielts';

const fmt = (b: number) => b.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Sesi bahasa hari ini di Beranda (D-62): progres 4 langkah, skill hari ini, dan perkiraan band. */
export function EnglishCard({ done, skill, band, target }: { done: Partial<Record<SessionStep, boolean>>; skill: Skill; band: number | null; target: number }) {
  const n = SESSION_STEPS.filter((x) => done[x]).length;
  return (
    <section aria-label="Bahasa Inggris hari ini" className="card flex flex-col gap-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="h-section">IELTS hari ini</h2>
        <span className="text-[12px] text-muted">{band != null ? `band ${fmt(band)} · target ${fmt(target)}` : `target ${fmt(target)}`}</span>
      </div>
      <div className="flex gap-1.5" aria-label={`${n} dari 4 langkah selesai`} role="img">
        {SESSION_STEPS.map((x) => <span key={x} className={`h-2 flex-1 rounded-full ${done[x] ? 'bg-accent' : 'bg-line'}`} />)}
      </div>
      <p className="text-[13px]">{n === 4 ? 'Sesi hari ini tuntas. Mantap.' : `${n} dari 4 langkah · skill hari ini ${SKILLS[skill].title}`}</p>
      <Link href={n === 4 ? '/bahasa' : '/bahasa/sesi'} className={`btn ${n === 4 ? '' : 'btn-primary'}`}>{n === 0 ? 'Mulai sesi 15 menit' : n === 4 ? 'Lihat perkembangan' : 'Lanjutkan sesi'}</Link>
    </section>
  );
}
