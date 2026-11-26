// Ringkasan pemakaian Gemini untuk halaman Pengaturan (tanpa server-only supaya bisa diuji).
import { addDays, todayIso, zonedParts } from './time';

export type UsageRow = { created_at: string; feature: string; total_tokens: number; ok: boolean };
export type DaySummary = { date: string; tokens: number; calls: number };

export const FEATURE_LABEL: Record<string, string> = {
  agent: 'Ra (teks dan suara)', receipt: 'Struk', english: 'Bahasa Inggris', english_tts: 'Suara Listening', automation: 'Otomasi', diagnose: 'Diagnosa',
};

/** Total token per hari selama `days` hari terakhir (lama ke baru), dan per fitur untuk hari ini. */
export function summarizeUsage(rows: UsageRow[], now = new Date(), days = 7): { daily: DaySummary[]; today: { feature: string; tokens: number; calls: number }[] } {
  const today = todayIso(now);
  const daily: DaySummary[] = Array.from({ length: days }, (_, i) => ({ date: addDays(today, i - days + 1), tokens: 0, calls: 0 }));
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const feat = new Map<string, { feature: string; tokens: number; calls: number }>();
  for (const r of rows) {
    const date = zonedParts(r.created_at).date;
    const d = byDate.get(date);
    if (d) { d.tokens += r.total_tokens; d.calls += 1; }
    if (date === today) {
      const f = feat.get(r.feature) ?? { feature: r.feature, tokens: 0, calls: 0 };
      f.tokens += r.total_tokens; f.calls += 1; feat.set(r.feature, f);
    }
  }
  return { daily, today: [...feat.values()].sort((a, b) => b.tokens - a.tokens) };
}
