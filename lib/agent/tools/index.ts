// Registry semua tools (SPEC 6.8) dan konversi ke deklarasi fungsi untuk Gemini.
import { z } from 'zod';
import { academicTools } from './academic';
import { automationTools } from './automation';
import { calendarTools } from './calendar';
import { englishTools } from './english';
import { financeTools } from './finance';
import { receiptTools } from './receipt';
import { researchTools } from './research';
import type { AnyTool } from './types';

export const TOOLS: AnyTool[] = [...financeTools, ...academicTools, ...researchTools, ...calendarTools, ...receiptTools, ...englishTools, ...automationTools];
export const TOOL_MAP: ReadonlyMap<string, AnyTool> = new Map(TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): AnyTool | null {
  return TOOL_MAP.get(name) ?? null;
}

/** Deklarasi fungsi untuk Gemini (`parametersJsonSchema`). Skema masukan: angka boleh dikirim sebagai teks rupiah. */
export function functionDeclarations() {
  return TOOLS.map((t) => {
    const schema = z.toJSONSchema(t.parameters, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
    delete schema.$schema;
    return { name: t.name, description: `${t.description}${t.permission === 'read' ? '' : ' (Perlu konfirmasi pengguna sebelum dijalankan.)'}`, parametersJsonSchema: schema };
  });
}
