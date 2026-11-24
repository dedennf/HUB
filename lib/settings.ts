// Pengaturan yang boleh diubah dari UI, dengan validasi Zod.
import { z } from 'zod';

export const SETTING_SCHEMAS = {
  theme: z.enum(['auto', 'light', 'dark']),
  profile_name: z.string().trim().max(40),
  profile_program: z.string().trim().max(60),
} as const;
export type SettingKey = keyof typeof SETTING_SCHEMAS;

export function readTheme(v: unknown): 'auto' | 'light' | 'dark' {
  const p = SETTING_SCHEMAS.theme.safeParse(v);
  return p.success ? p.data : 'auto';
}
export const readText = (v: unknown): string => (typeof v === 'string' ? v : '');
