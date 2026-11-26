// Pengaturan yang boleh diubah dari UI, dengan validasi Zod.
import { z } from 'zod';

export const SETTING_SCHEMAS = {
  theme: z.enum(['auto', 'light', 'dark']),
  profile_name: z.string().trim().max(40),
  profile_program: z.string().trim().max(60),
  briefing_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  recap_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  vocab_review_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  ai_daily_token_limit: z.coerce.number().int().min(0).max(100_000_000),
  quiet_hours: z.tuple([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]),
} as const;
export type SettingKey = keyof typeof SETTING_SCHEMAS;

export function readTheme(v: unknown): 'auto' | 'light' | 'dark' {
  const p = SETTING_SCHEMAS.theme.safeParse(v);
  return p.success ? p.data : 'auto';
}
export const readText = (v: unknown): string => (typeof v === 'string' ? v : '');
