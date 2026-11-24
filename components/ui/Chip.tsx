import type { ReactNode } from 'react';

export type ChipTone = 'neutral' | 'warn' | 'info' | 'ok' | 'danger';
const TONES: Record<ChipTone, string> = {
  neutral: 'bg-track text-fg',
  warn: 'bg-warn-bg text-warn-fg',
  info: 'bg-info-bg text-info-fg',
  ok: 'bg-ok-bg text-ok-fg',
  danger: 'bg-danger-bg text-danger-fg',
};

export function Chip({ tone = 'neutral', children, className = '' }: { tone?: ChipTone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-lg px-2 py-1 text-[12px] font-semibold ${TONES[tone]} ${className}`}>{children}</span>;
}
