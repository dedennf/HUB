// Bentuk baris tabel yang dipakai UI (subset kolom, lihat supabase/migrations).

export type Account = {
  id: string; name: string; type: 'bank' | 'ewallet' | 'cash' | 'investment';
  opening_balance: number; balance: number; aliases: string[]; is_archived: boolean; sort_order: number;
};
export type Category = {
  id: string; slug: string | null; name: string; kind: 'expense' | 'income'; icon: string | null; color: string | null;
  monthly_budget: number | null; keywords: string[]; subcategories: string[]; sort_order: number; is_hidden: boolean;
};
export type Transaction = {
  id: string; kind: 'expense' | 'income' | 'transfer'; amount: number; account_id: string; to_account_id: string | null;
  category_id: string | null; subcategory: string | null; merchant: string | null; note: string | null;
  occurred_at: string; source: string; group_id: string | null;
};
export type Bill = {
  id: string; name: string; amount: number; frequency: 'monthly' | 'yearly' | 'once'; next_due_date: string | null;
  default_account_id: string | null; category_id: string | null; is_active: boolean; note: string | null;
};
export type Debt = {
  id: string; direction: 'payable' | 'receivable'; person: string; amount: number; paid_amount: number;
  occurred_on: string | null; due_on: string | null; note: string | null;
};
export type SavingsGoal = { id: string; name: string; target_amount: number; saved_amount: number; deadline: string | null };
export type SinkingFund = { id: string; name: string; amount: number; saved_amount: number; due_on: string | null; is_done: boolean };
export type Investment = { id: string; name: string; instrument: string; platform: string | null; invested_amount: number | null; current_value: number | null };

export type Semester = { id: string; name: string; number: number | null; start_date: string | null; end_date: string | null; is_active: boolean };
export type Course = { id: string; semester_id: string | null; name: string; alias: string | null; lecturer: string | null; credits: number | null };
export type CourseSchedule = { id: string; course_id: string; weekday: number; start_time: string; end_time: string; location: string | null };
export type Task = {
  id: string; course_id: string | null; parent_id: string | null; title: string; kind: string; priority: string;
  due_at: string | null; status: 'todo' | 'in_progress' | 'done' | 'overdue'; description: string | null;
};
export type TaskWorkSlot = { id: string; task_id: string; start_at: string; end_at: string };
export type Holiday = { id: string; name: string; start_date: string; end_date: string | null };
export type CalendarEvent = {
  id: string; title: string; start_at: string; end_at: string | null; is_all_day: boolean; location: string | null;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'; recurrence_until: string | null;
};

export type ResearchProject = { id: string; title: string; status: string };
export type ResearchTarget = { id: string; project_id: string | null; title: string; due_date: string | null; progress: number };
export type ResearchNeed = { id: string; project_id: string | null; item: string; kind: string | null; status: string };
export type ResearchIdea = { id: string; project_id: string | null; content: string; source: string | null; status: string };
export type Reading = { id: string; title: string; authors: string | null; year: number | null; doi: string | null; verification_status: string };
export type Supervision = { id: string; met_on: string | null; supervisor: string | null; points: string | null; status: string; next_on: string | null };
