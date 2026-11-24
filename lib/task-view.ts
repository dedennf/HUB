// Menyiapkan properti TaskRow dari baris tugas.
import type { Course, Task } from './types';
import { dueChip } from './tasks';

const KIND: Record<string, string> = { assignment: 'tugas', exam: 'ujian', quiz: 'kuis', practicum: 'praktikum' };

export function taskRowProps(t: Task, courses: Map<string, Course>, today: string) {
  const chip = dueChip(t.due_at, today);
  return {
    id: t.id,
    title: t.title,
    detail: [courses.get(t.course_id ?? '')?.name ?? 'Umum', KIND[t.kind], t.priority === 'high' ? 'prioritas tinggi' : ''].filter(Boolean).join(' · '),
    dueLabel: chip?.label,
    dueTone: chip?.tone,
    done: t.status === 'done',
  };
}
