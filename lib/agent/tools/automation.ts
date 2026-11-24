// Tools otomasi dan memori (SPEC 6.8, 8.2).
import { z } from 'zod';
import { normalize, resolveAccount, resolveAutomation, resolveCategory, resolveCourse } from '../resolve';
import { describeAction, describeTrigger } from '@/lib/automation/describe';
import { deleteRow, insertRow, isErr, pick, updateRow } from './common';
import { fail, type ReadTool, type UndoOp, type WriteTool } from './types';

const op = z.enum(['<', '<=', '>', '>=', '=']);
export const triggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('schedule'), cron: z.string().regex(/^(\S+\s+){4}\S+$/, 'Cron 5 kolom').describe('Cron 5 kolom, zona Asia/Jakarta, mis. "0 8 5 * *" = tiap tanggal 5 jam 08.00') }),
  z.object({ type: z.literal('event'), event: z.enum(['transaction.created', 'task.created', 'task.completed', 'research.progress_updated', 'vocab.created', 'bill.created']) }),
  z.object({ type: z.literal('threshold'), metric: z.enum(['account_balance']), account: z.string(), op, value: z.number() }),
]);
export const conditionSchema = z.object({ metric: z.enum(['category_spend_week', 'category_spend_month', 'account_balance']), category: z.string().optional(), account: z.string().optional(), op, value: z.number() });
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add_transaction'), args: z.record(z.string(), z.unknown()).describe('Argumen seperti add_transaction') }),
  z.object({ type: z.literal('notify'), title: z.string().max(80), body: z.string().max(300).optional() }),
  z.object({ type: z.literal('agent_task'), instruction: z.string().max(500) }),
]);

export const listAutomations: ReadTool<z.ZodObject<Record<string, never>>> = {
  name: 'list_automations', module: 'automation', permission: 'read',
  description: 'Daftar aturan otomasi beserta statusnya.',
  parameters: z.object({}),
  async run(ctx) {
    const { data } = await ctx.db.from('automations').select('id,name,is_enabled,is_system,trigger,conditions,action,mode,auto_write,last_run_at,next_run_at').order('created_at');
    return { ok: true, data: data ?? [] };
  },
};

const createParams = z.object({
  name: z.string().min(1).max(80),
  trigger: triggerSchema,
  conditions: z.array(conditionSchema).max(5).optional(),
  action: actionSchema,
  mode: z.enum(['rule', 'agent']).describe('rule = aturan pasti tanpa AI, agent = butuh penalaran (hanya boleh menyarankan dan memberi notifikasi)'),
  auto_write: z.boolean().optional().describe('true = aturan rule boleh menulis data tanpa konfirmasi. Hanya bila pengguna memintanya eksplisit.'),
});
export const createAutomation: WriteTool<typeof createParams, Record<string, unknown>> = {
  name: 'create_automation', module: 'automation', permission: 'write',
  description: 'Buat aturan otomasi dari kalimat biasa, mis. "setiap tanggal 5 catat bayar wifi 150 ribu dari GoPay". Ringkasan kartu menjelaskan aturan dalam bahasa manusia.',
  parameters: createParams,
  async prepare(ctx, a) {
    if (a.mode === 'agent' && a.action.type === 'add_transaction') return fail('Otomasi mode agent hanya boleh menyarankan atau memberi notifikasi (SPEC 8.1).', { field: 'mode' });
    if (a.auto_write && a.mode !== 'rule') return fail('auto_write hanya untuk mode rule.', { field: 'auto_write' });
    // nama di argumen aksi transaksi diresolusi sekarang supaya aturan tidak rusak bila nama berubah
    const action = { ...a.action } as Record<string, unknown>;
    if (a.action.type === 'add_transaction') {
      const args = { ...a.action.args } as Record<string, unknown>;
      if (typeof args.account === 'string') { const r = pick(await resolveAccount(ctx.db, args.account), 'action.args.account', 'akun', args.account); if (isErr(r)) return r; args.account_id = r.id; }
      if (typeof args.category === 'string') { const r = await resolveCategory(ctx.db, args.category, args.kind === 'income' ? 'income' : 'expense'); if (r.kind === 'found') args.category_id = r.id; }
      action.args = args;
    }
    const labels: string[] = [];
    if (a.action.type === 'add_transaction') {
      const args = action.args as Record<string, unknown>;
      if (args.category_id) { const { data } = await ctx.db.from('categories').select('name').eq('id', String(args.category_id)).maybeSingle(); if (data) labels.push(data.name); }
      if (args.account_id) { const { data } = await ctx.db.from('accounts').select('name').eq('id', String(args.account_id)).maybeSingle(); if (data) labels.push(data.name); }
    }
    const when = describeTrigger(a.trigger as Record<string, unknown>);
    const what = describeAction(action) + (labels.length ? `, ${labels.join(', ')}` : '');
    return {
      ok: true, summary: `${a.name} · ${when} → ${what} · Otomatis tanpa konfirmasi: ${a.auto_write ? 'Ya' : 'Tidak'}`,
      resolved: { name: a.name, trigger: a.trigger, conditions: a.conditions ?? [], action, mode: a.mode, auto_write: !!a.auto_write, is_enabled: true },
    };
  },
  async commit(ctx, r) {
    const res = await insertRow(ctx, 'automations', r);
    if (isErr(res)) return res;
    return { ok: true, data: { id: res.id }, undo: { ops: [res.undo] } };
  },
};

const toggleParams = z.object({ automation_id: z.string().describe('Id atau nama aturan'), is_enabled: z.boolean() });
export const toggleAutomation: WriteTool<typeof toggleParams, { id: string; is_enabled: boolean }> = {
  name: 'toggle_automation', module: 'automation', permission: 'write',
  description: 'Aktifkan atau nonaktifkan aturan otomasi.',
  parameters: toggleParams,
  async prepare(ctx, a) {
    const r = pick(await resolveAutomation(ctx.db, a.automation_id), 'automation_id', 'otomasi', a.automation_id);
    if (isErr(r)) return r;
    return { ok: true, summary: `${a.is_enabled ? 'Aktifkan' : 'Nonaktifkan'} otomasi ${r.label}`, resolved: { id: r.id, is_enabled: a.is_enabled } };
  },
  async commit(ctx, r) {
    const u = await updateRow(ctx, 'automations', r.id, { is_enabled: r.is_enabled });
    if (isErr(u)) return u;
    return { ok: true, data: { id: r.id }, undo: { ops: [u] } };
  },
};

export const deleteAutomation: WriteTool<z.ZodObject<{ automation_id: z.ZodString }>, { id: string }> = {
  name: 'delete_automation', module: 'automation', permission: 'destructive',
  description: 'Hapus aturan otomasi. Otomasi bawaan sebaiknya dinonaktifkan saja.',
  parameters: z.object({ automation_id: z.string().describe('Id atau nama aturan') }),
  async prepare(ctx, a) {
    const r = pick(await resolveAutomation(ctx.db, a.automation_id), 'automation_id', 'otomasi', a.automation_id);
    if (isErr(r)) return r;
    const { data } = await ctx.db.from('automations').select('is_system').eq('id', r.id).maybeSingle();
    if (data?.is_system) return fail('Otomasi bawaan tidak bisa dihapus. Nonaktifkan dengan toggle_automation.');
    return { ok: true, summary: `Hapus otomasi ${r.label}`, resolved: { id: r.id } };
  },
  async commit(ctx, { id }) {
    const d = await deleteRow(ctx, 'automations', id);
    if (isErr(d)) return d;
    return { ok: true, data: { id }, undo: { ops: [d] } };
  },
};

const rememberParams = z.object({
  kind: z.enum(['alias', 'merchant_rule', 'habit', 'preference', 'correction']),
  key: z.string().min(1).max(120).describe('Frasa pemicu, mis. "atm kuning" atau "Indomaret"'),
  value: z.record(z.string(), z.unknown()).describe('Untuk alias: {"account": "BRI"} atau {"course": "Statistika"}. Untuk merchant_rule: {"category": "Kebutuhan harian"}. Lainnya: {"text": "..."}'),
});
export const remember: WriteTool<typeof rememberParams, { kind: string; key: string; value: Record<string, unknown> }> = {
  name: 'remember', module: 'automation', permission: 'write',
  description: 'Simpan memori jangka panjang, mis. pengguna berkata "kalau aku bilang atm kuning itu BRI ya" atau "Indomaret masuk kebutuhan harian".',
  parameters: rememberParams,
  async prepare(ctx, a) {
    const value = { ...a.value };
    let label = typeof value.text === 'string' ? value.text : '';
    if (typeof value.account === 'string') { const r = pick(await resolveAccount(ctx.db, value.account), 'value.account', 'akun', value.account); if (isErr(r)) return r; value.account_id = r.id; label = r.label; }
    if (typeof value.course === 'string') { const r = pick(await resolveCourse(ctx.db, value.course), 'value.course', 'mata kuliah', value.course); if (isErr(r)) return r; value.course_id = r.id; label = r.label; }
    if (typeof value.category === 'string') { const r = await resolveCategory(ctx.db, value.category, 'expense'); const c = pick(r, 'value.category', 'kategori', value.category); if (isErr(c)) return c; value.category_id = c.id; label = c.label; }
    return { ok: true, summary: `Ingat: "${a.key}" → ${label || JSON.stringify(a.value)}`, resolved: { kind: a.kind, key: normalize(a.key), value } };
  },
  async commit(ctx, r) {
    const { data: ex } = await ctx.db.from('agent_memory').select('id').eq('kind', r.kind).eq('key', r.key).maybeSingle();
    let ops: UndoOp[];
    let id: string;
    if (ex) {
      const u = await updateRow(ctx, 'agent_memory', ex.id, { value: r.value, confidence: 1, last_used_at: ctx.now.toISOString() });
      if (isErr(u)) return u;
      ops = [u]; id = ex.id;
    } else {
      const ins = await insertRow(ctx, 'agent_memory', { kind: r.kind, key: r.key, value: r.value, last_used_at: ctx.now.toISOString() });
      if (isErr(ins)) return ins;
      ops = [ins.undo]; id = ins.id;
    }
    return { ok: true, data: { id }, undo: { ops } };
  },
};

export const automationTools = [listAutomations, createAutomation, toggleAutomation, deleteAutomation, remember];
