// Registry tools agen (SPEC 6.8, Fase 2). Tool baca langsung dijalankan.
// Tool tulis dua tahap: prepare (resolusi nama, ringkasan untuk kartu, tanpa mengubah data)
// lalu commit (dijalankan hanya setelah pengguna menyetujui, menghasilkan data undo).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';

export type Permission = 'read' | 'write' | 'destructive';
export type ToolModule = 'finance' | 'academic' | 'research' | 'calendar' | 'receipt' | 'english' | 'automation';

export type ToolCtx = {
  db: SupabaseClient;
  /** Tanggal hari ini di zona aplikasi (YYYY-MM-DD). */
  today: string;
  now: Date;
};

export type Candidate = { id: string; label: string };

export type UndoOp =
  | { op: 'delete'; table: string; id: string }
  | { op: 'restore'; table: string; row: Record<string, unknown> }
  | { op: 'update'; table: string; id: string; values: Record<string, unknown> };
export type UndoPayload = { ops: UndoOp[] };

export type ToolError = { ok: false; error: string; field?: string; candidates?: Candidate[] };

export type ReadResult = { ok: true; data: unknown } | ToolError;

export type Prepared<R> =
  | { ok: true; summary: string; resolved: R; doubtful?: string[]; warning?: string }
  | ToolError;

export type Committed = { ok: true; data: Record<string, unknown>; undo: UndoPayload } | ToolError;

type Base<S extends z.ZodType> = {
  name: string;
  /** Deskripsi berbahasa Indonesia: inilah yang dibaca Gemini. */
  description: string;
  module: ToolModule;
  parameters: S;
};

export type ReadTool<S extends z.ZodType = z.ZodType> = Base<S> & {
  permission: 'read';
  run: (ctx: ToolCtx, args: z.infer<S>) => Promise<ReadResult>;
};

export type WriteTool<S extends z.ZodType = z.ZodType, R = Record<string, unknown>> = Base<S> & {
  permission: 'write' | 'destructive';
  prepare: (ctx: ToolCtx, args: z.infer<S>) => Promise<Prepared<R>>;
  commit: (ctx: ToolCtx, resolved: R) => Promise<Committed>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = ReadTool<any> | WriteTool<any, any>;

export const fail = (error: string, extra: Omit<ToolError, 'ok' | 'error'> = {}): ToolError => ({ ok: false, error, ...extra });
