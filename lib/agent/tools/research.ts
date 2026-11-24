// Tools riset (SPEC 6.8).
import { z } from 'zod';
import { defaultProject, resolveProject, resolveTarget } from '../resolve';
import { dateStr, insertRow, isErr, pick, updateRow } from './common';
import { fail, type ReadTool, type ToolCtx, type WriteTool } from './types';

async function projectId(ctx: ToolCtx, name: string | undefined, required: boolean) {
  if (name) return pick(await resolveProject(ctx.db, name), 'project', 'proyek riset', name);
  const id = await defaultProject(ctx.db);
  if (!id && required) return fail('Belum ada proyek riset aktif. Sebutkan proyeknya atau minta pengguna membuatnya.', { field: 'project' });
  return id ? { id, label: 'proyek aktif' } : null;
}

export const getResearchProgress: ReadTool<z.ZodObject<{ project: z.ZodOptional<z.ZodString> }>> = {
  name: 'get_research_progress', module: 'research', permission: 'read',
  description: 'Progres riset: target dan persennya, hari sejak terakhir disentuh, kebutuhan belum terpenuhi, dan bimbingan berikutnya.',
  parameters: z.object({ project: z.string().optional() }),
  async run(ctx, { project }) {
    const p = project ? pick(await resolveProject(ctx.db, project), 'project', 'proyek riset', project) : null;
    if (p && 'ok' in p) return p;
    let tq = ctx.db.from('research_targets').select('id,title,progress,due_date,last_touched_at,project_id');
    let nq = ctx.db.from('research_needs').select('item,status,project_id').neq('status', 'fulfilled');
    if (p) { tq = tq.eq('project_id', p.id); nq = nq.eq('project_id', p.id); }
    const [{ data: projects }, { data: targets }, { data: needs }, { data: sup }] = await Promise.all([
      ctx.db.from('research_projects').select('id,title,status'), tq, nq,
      ctx.db.from('supervisions').select('next_on,supervisor').gte('next_on', ctx.today).order('next_on').limit(1),
    ]);
    const now = ctx.now.getTime();
    return {
      ok: true,
      data: {
        projects, next_supervision: sup?.[0] ?? null, open_needs: needs,
        targets: (targets ?? []).map((t) => ({ ...t, days_untouched: t.last_touched_at ? Math.floor((now - Date.parse(t.last_touched_at)) / 864e5) : null })),
      },
    };
  },
};

const targetParams = z.object({ project: z.string().optional().describe('Bawaan proyek aktif'), title: z.string().min(1).max(160), due_date: dateStr('Tenggat').optional() });
export const addResearchTarget: WriteTool<typeof targetParams, Record<string, unknown>> = {
  name: 'add_research_target', module: 'research', permission: 'write',
  description: 'Tambah target riset (mis. "Draf Bab II selesai 15 Des").',
  parameters: targetParams,
  async prepare(ctx, a) {
    const p = await projectId(ctx, a.project, true);
    if (!p || isErr(p)) return p ?? fail('Proyek tidak ditemukan.');
    return { ok: true, summary: `Target riset: ${a.title}${a.due_date ? ` · ${a.due_date}` : ''}`, resolved: { project_id: p.id, title: a.title, due_date: a.due_date ?? null, last_touched_at: ctx.now.toISOString() } };
  },
  async commit(ctx, r) {
    const res = await insertRow(ctx, 'research_targets', r);
    if (isErr(res)) return res;
    return { ok: true, data: { id: res.id }, undo: { ops: [res.undo] } };
  },
};

const progParams = z.object({ target: z.string().describe('Judul atau id target'), progress: z.number().int().min(0).max(100) });
export const updateResearchProgress: WriteTool<typeof progParams, { id: string; progress: number }> = {
  name: 'update_research_progress', module: 'research', permission: 'write',
  description: 'Perbarui persen progres sebuah target riset (0 sampai 100).',
  parameters: progParams,
  async prepare(ctx, a) {
    const r = pick(await resolveTarget(ctx.db, a.target), 'target', 'target riset', a.target);
    if (isErr(r)) return r;
    const { data } = await ctx.db.from('research_targets').select('progress').eq('id', r.id).maybeSingle();
    return { ok: true, summary: `Progres ${r.label}: ${data?.progress ?? 0}% → ${a.progress}%`, resolved: { id: r.id, progress: a.progress } };
  },
  async commit(ctx, r) {
    const u = await updateRow(ctx, 'research_targets', r.id, { progress: r.progress, last_touched_at: ctx.now.toISOString() });
    if (isErr(u)) return u;
    return { ok: true, data: { id: r.id }, undo: { ops: [u] } };
  },
};

const ideaParams = z.object({ project: z.string().optional(), content: z.string().min(1).max(1000) });
export const addResearchIdea: WriteTool<typeof ideaParams, Record<string, unknown>> = {
  name: 'add_research_idea', module: 'research', permission: 'write',
  description: 'Simpan ide riset lanjutan.',
  parameters: ideaParams,
  async prepare(ctx, a) {
    const p = await projectId(ctx, a.project, false);
    if (p && isErr(p)) return p;
    return { ok: true, summary: `Ide riset: ${a.content}`, resolved: { project_id: p?.id ?? null, content: a.content } };
  },
  async commit(ctx, r) {
    const res = await insertRow(ctx, 'research_ideas', r);
    if (isErr(res)) return res;
    return { ok: true, data: { id: res.id }, undo: { ops: [res.undo] } };
  },
};

const needParams = z.object({ project: z.string().optional(), item: z.string().min(1).max(200) });
export const addResearchNeed: WriteTool<typeof needParams, Record<string, unknown>> = {
  name: 'add_research_need', module: 'research', permission: 'write',
  description: 'Catat kebutuhan riset (data, alat, izin, akses, literatur).',
  parameters: needParams,
  async prepare(ctx, a) {
    const p = await projectId(ctx, a.project, false);
    if (p && isErr(p)) return p;
    const kind = a.item.toLowerCase().match(/\b(data|alat|izin|akses|literatur)\b/)?.[1] ?? null;
    return { ok: true, summary: `Kebutuhan riset: ${a.item}`, resolved: { project_id: p?.id ?? null, item: a.item, kind } };
  },
  async commit(ctx, r) {
    const res = await insertRow(ctx, 'research_needs', r);
    if (isErr(res)) return res;
    return { ok: true, data: { id: res.id }, undo: { ops: [res.undo] } };
  },
};

export const researchTools = [getResearchProgress, addResearchTarget, updateResearchProgress, addResearchIdea, addResearchNeed];
