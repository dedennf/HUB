// Label tenggat untuk TaskRow (DESIGN: Besok = warn, lainnya netral).
import type { ChipTone } from '@/components/ui/Chip';
import { formatTime } from './format';
import { diffDays, zonedParts } from './time';

export function dueChip(dueAt: string | null, today: string): { label: string; tone: ChipTone } | null {
  if (!dueAt) return null;
  const d = diffDays(zonedParts(dueAt).date, today);
  if (d < 0) return { label: `Lewat ${-d} hari`, tone: 'danger' };
  if (d === 0) return { label: 'Hari ini', tone: 'warn' };
  if (d === 1) return { label: 'Besok', tone: 'warn' };
  return { label: `${d} hari`, tone: 'neutral' };
}

/** "besok 23.59", "hari ini 10.00", "Jum 27 Nov 23.59" */
export function dueText(dueAt: string, today: string): string {
  const { date, time } = zonedParts(dueAt);
  const d = diffDays(date, today);
  const t = formatTime(time);
  if (d === 0) return `hari ini ${t}`;
  if (d === 1) return `besok ${t}`;
  if (d === -1) return `kemarin ${t}`;
  return `${new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(dueAt)).replace('.', '')} ${t}`;
}
