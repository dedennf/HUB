// Ringkasan progres proyek riset (ProgressCard).
import { diffDays, zonedParts } from './time';
import type { ResearchProject, ResearchTarget, Supervision } from './types';

export type ProjectSummary = {
  project: ResearchProject;
  percent: number;
  done: number;
  total: number;
  nextSupervision: string | null;
};

/** Proyek aktif pertama. Persen = rata-rata progres target (bulat). */
export function summarizeProject(projects: ResearchProject[], targets: ResearchTarget[], supervisions: Supervision[], today: string): ProjectSummary | null {
  const project = projects.find((p) => p.status === 'active') ?? projects[0];
  if (!project) return null;
  const mine = targets.filter((t) => t.project_id === project.id);
  const percent = mine.length ? Math.round(mine.reduce((n, t) => n + t.progress, 0) / mine.length) : 0;
  const next = supervisions.map((s) => s.next_on).filter((d): d is string => !!d && d >= today).sort()[0] ?? null;
  return { project, percent, done: mine.filter((t) => t.progress >= 100).length, total: mine.length, nextSupervision: next };
}

/** Hari sejak target terakhir disentuh, atau null bila belum pernah. */
export function daysUntouched(lastTouched: string | null, today: string): number | null {
  return lastTouched ? diffDays(today, zonedParts(lastTouched).date) : null;
}
