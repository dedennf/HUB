import type { Metadata } from 'next';
import { PageHeader, Section } from '@/components/ui/Section';
import { readDailyLimit } from '@/lib/ai-usage';
import { FEATURE_LABEL, summarizeUsage, type UsageRow } from '@/lib/ai-usage-summary';
import { db, getSettings } from '@/lib/data';
import { formatDateId, todayIso, zonedToIso, addDays } from '@/lib/time';
import { LimitForm } from './LimitForm';

export const metadata: Metadata = { title: 'Pemakaian Gemini' };

const fmt = (n: number) => n.toLocaleString('id-ID');

export default async function GeminiUsagePage() {
  const s = await db();
  const since = zonedToIso(addDays(todayIso(), -6));
  const [{ data }, settings] = await Promise.all([
    s.from('ai_usage').select('created_at,feature,total_tokens,ok').gte('created_at', since).order('created_at').limit(5000),
    getSettings(s, ['ai_daily_token_limit']),
  ]);
  const limit = readDailyLimit(settings.ai_daily_token_limit);
  const { daily, today } = summarizeUsage((data ?? []) as UsageRow[]);
  const usedToday = daily[daily.length - 1]?.tokens ?? 0;
  const max = Math.max(1, limit, ...daily.map((d) => d.tokens));
  const pct = limit ? Math.min(100, Math.round((usedToday / limit) * 100)) : null;
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Pemakaian Gemini" back={{ href: '/pengaturan', label: 'Pengaturan' }} />
      <section className="card p-4">
        <p className="label">Hari ini</p>
        <p className="num text-[28px] font-bold">{fmt(usedToday)} <span className="text-[14px] font-normal text-muted">token{limit ? ` dari ${fmt(limit)}` : ''}</span></p>
        {pct != null && (
          <span className="mt-2 block h-2 rounded-full bg-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Pemakaian token hari ini">
            <span className={`block h-2 rounded-full ${pct >= 100 ? 'bg-negative' : pct >= 80 ? 'bg-warn-fg' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
          </span>
        )}
        {pct != null && pct >= 100 && <p className="mt-2 text-[13px] text-negative">Batas harian tercapai. Ra memakai pengurai lokal sampai besok.</p>}
        <p className="mt-2 text-[12px] text-muted">Dihitung dari panggilan Gemini lewat server Kompas. Percakapan Live tersambung langsung dari browser, jadi tidak ikut terhitung.</p>
      </section>

      <Section title="Per fitur hari ini">
        <div className="card rows overflow-hidden">
          {today.length ? today.map((f) => (
            <div key={f.feature} className="flex min-h-[48px] items-center justify-between gap-3 px-4 py-2 text-[14px]">
              <span>{FEATURE_LABEL[f.feature] ?? f.feature} <span className="text-[12px] text-muted">· {f.calls} panggilan</span></span>
              <span className="num font-semibold">{fmt(f.tokens)}</span>
            </div>
          )) : <p className="px-4 py-3 text-[13px] text-muted">Belum ada panggilan Gemini hari ini.</p>}
        </div>
      </Section>

      <Section title="7 hari terakhir">
        <div className="card flex flex-col gap-2 p-4">
          {daily.map((d) => (
            <div key={d.date} className="grid grid-cols-[72px_1fr_80px] items-center gap-2 text-[13px]">
              <span className="text-muted">{formatDateId(d.date)}</span>
              <span className="block h-2 rounded-full bg-track"><span className="block h-2 rounded-full bg-accent" style={{ width: `${Math.round((d.tokens / max) * 100)}%` }} /></span>
              <span className="num text-right">{fmt(d.tokens)}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Batas harian">
        <div className="card p-4"><LimitForm limit={limit} /></div>
      </Section>
    </div>
  );
}
