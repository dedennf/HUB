'use client';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { useState, useTransition } from 'react';
import { markReviewDone } from '@/app/(dashboard)/bahasa/ielts-actions';
import { ReviewDeck, type ReviewCard } from '@/components/english/ReviewDeck';
import { SESSION_STEPS, SKILLS, type SessionStep, type Skill } from '@/lib/english/ielts';
import { GrammarStep } from './GrammarStep';
import { WordsStep } from './WordsStep';

const TITLE: Record<SessionStep, string> = { review: 'Review', words: 'Kata baru', grammar: 'Grammar', skill: 'Skill tes' };

/** Sesi harian sekitar 15 menit (D-60): review kartu, 5 kata baru, satu topik grammar, lalu skill IELTS hari itu. */
export function DailySession({ cards, done: initial, skill }: { cards: ReviewCard[]; done: Partial<Record<SessionStep, boolean>>; skill: Skill }) {
  const [done, setDone] = useState(initial);
  const firstOpen = SESSION_STEPS.find((s) => !initial[s] && !(s === 'review' && !cards.length)) ?? 'skill';
  const [step, setStep] = useState<SessionStep>(firstOpen);
  const [, start] = useTransition();
  const finish = (s: SessionStep) => {
    setDone((d) => ({ ...d, [s]: true }));
    const next = SESSION_STEPS[SESSION_STEPS.indexOf(s) + 1];
    if (next) setStep(next);
  };
  const sk = SKILLS[skill];
  const count = SESSION_STEPS.filter((s) => done[s]).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 rounded-full bg-line"><div className="h-1.5 rounded-full bg-accent transition-all" style={{ width: `${(count / 4) * 100}%` }} /></div>
        <span className="text-[12px] text-muted">{count} dari 4 langkah</span>
      </div>
      <nav aria-label="Langkah sesi" className="grid grid-cols-4 gap-2">
        {SESSION_STEPS.map((s, i) => (
          <button key={s} type="button" aria-current={step === s ? 'step' : undefined} aria-label={`${TITLE[s]}${done[s] ? ', selesai' : ''}`} onClick={() => setStep(s)}
            className={`flex min-h-12 flex-col items-center justify-center rounded-xl border px-1 text-[12px] ${step === s ? 'border-accent bg-accent-soft font-semibold text-accent-strong' : 'border-line bg-surface'}`}>
            <span className="inline-flex items-center gap-1">{done[s] ? <Check size={14} aria-hidden="true" /> : <span className="num text-muted">{i + 1}</span>}{TITLE[s]}</span>
          </button>
        ))}
      </nav>

      {step === 'review' && (
        cards.length
          ? <ReviewDeck cards={cards} onDone={() => start(async () => { await markReviewDone(); finish('review'); })} />
          : (
            <div className="card flex flex-col gap-3 p-4 text-[13px]">
              <p className="text-muted">Tidak ada kartu yang jatuh tempo hari ini.</p>
              <button type="button" className="btn self-start" onClick={() => start(async () => { await markReviewDone(); finish('review'); })}>Lanjut ke kata baru</button>
            </div>
          )
      )}
      {step === 'words' && <WordsStep onDone={() => finish('words')} />}
      {step === 'grammar' && <GrammarStep onDone={() => finish('grammar')} />}
      {step === 'skill' && (
        <div className="card flex flex-col gap-3 p-4">
          <p className="text-[12px] text-muted">Skill hari ini · sekitar {sk.minutes} menit</p>
          <h3 className="font-display text-[20px] font-extrabold">{sk.title}</h3>
          <p className="text-[14px]">{sk.detail}</p>
          {done.skill ? <p role="status" className="text-[13px] font-semibold text-positive">Sudah dikerjakan hari ini.</p> : null}
          <Link href={sk.href} className="btn btn-primary">{done.skill ? 'Latihan lagi' : `Mulai ${sk.title}`}</Link>
          <p className="text-[12px] text-muted">Langkah ini otomatis tercentang setelah hasil latihanmu dinilai.</p>
        </div>
      )}
    </div>
  );
}
