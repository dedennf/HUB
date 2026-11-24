import { describe, expect, it } from 'vitest';
import { functionDeclarations, TOOLS } from './index';

// Tabel SPEC 6.8: nama tool → izin.
const SPEC: Record<string, 'read' | 'write' | 'destructive'> = {
  get_balances: 'read', search_transactions: 'read', spending_summary: 'read', get_bills: 'read',
  add_transaction: 'write', add_transfer: 'write', update_transaction: 'destructive', delete_transaction: 'destructive', add_bill: 'write', update_investment: 'write',
  get_tasks: 'read', get_course_schedule: 'read', add_task: 'write', complete_task: 'write', add_material: 'write', add_course: 'write',
  get_research_progress: 'read', add_research_target: 'write', update_research_progress: 'write', add_research_idea: 'write', add_research_need: 'write',
  get_calendar: 'read', find_free_slots: 'read', schedule_task_work: 'write', add_event: 'write',
  read_receipt: 'read',
  save_vocab: 'write', get_due_reviews: 'read', grade_review: 'write', correct_writing: 'write', start_practice: 'read', explain_text: 'read', get_english_progress: 'read',
  list_automations: 'read', create_automation: 'write', toggle_automation: 'write', delete_automation: 'destructive', remember: 'write',
};

describe('registry tools', () => {
  it('lengkap sesuai SPEC 6.8 dengan izin yang sama', () => {
    expect(Object.fromEntries(TOOLS.map((t) => [t.name, t.permission]))).toEqual(SPEC);
  });
  it('nama unik, deskripsi berbahasa Indonesia, tool tulis punya prepare dan commit', () => {
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
    for (const t of TOOLS) {
      expect(t.description.length, t.name).toBeGreaterThan(20);
      expect(/\b(the|and|with)\b/i.test(t.description), `${t.name} berbahasa Inggris?`).toBe(false);
      if (t.permission === 'read') expect(typeof t.run).toBe('function');
      else { expect(typeof t.prepare).toBe('function'); expect(typeof t.commit).toBe('function'); }
    }
  });
  it('setiap parameter bisa diubah ke JSON Schema objek untuk Gemini', () => {
    const decl = functionDeclarations();
    expect(decl).toHaveLength(TOOLS.length);
    for (const d of decl) {
      expect(d.parametersJsonSchema.type, d.name).toBe('object');
      expect(JSON.stringify(d.parametersJsonSchema)).not.toContain('$schema');
    }
    const tx = decl.find((d) => d.name === 'add_transaction')!;
    expect(tx.description).toContain('konfirmasi');
    expect((tx.parametersJsonSchema.required as string[]).sort()).toEqual(['amount', 'kind']);
  });
  it('validasi Zod menolak argumen salah', () => {
    const tx = TOOLS.find((t) => t.name === 'add_transaction')!;
    expect(tx.parameters.safeParse({ kind: 'expense', amount: '30rb' }).success).toBe(true);
    expect(tx.parameters.safeParse({ kind: 'expense', amount: -5 }).success).toBe(false);
    expect(tx.parameters.safeParse({ kind: 'beli', amount: 5000 }).success).toBe(false);
    const tf = TOOLS.find((t) => t.name === 'add_transfer')!;
    expect(tf.parameters.safeParse({ amount: 1000, from_account: 'BCA' }).success).toBe(false);
  });
});
