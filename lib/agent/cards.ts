// Tampilan kartu usulan aksi (SPEC 6.3, DESIGN 6): fungsi murni dari baris agent_actions ke data kartu.
// Chip yang punya `field` bisa diubah pengguna sebelum disetujui. Nilai ubahan dikirim sebagai argumen tool.
import { addDays, zonedParts } from '@/lib/time';

export type Lookups = {
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string; kind: 'expense' | 'income' }[];
  courses: { id: string; name: string }[];
};
export type ChipEdit = 'account' | 'category_expense' | 'category_income' | 'course' | 'date' | 'datetime';
export type CardChip = { label: string; doubtful?: boolean; field?: string; edit?: ChipEdit; value?: string };
export type CardIcon = 'expense' | 'income' | 'transfer' | 'task' | 'event' | 'idea' | 'need' | 'vocab' | 'delete' | 'other';
export type CardView = {
  id: string; tool: string; icon: CardIcon; kindLabel: string; value: string; chips: CardChip[];
  note?: string; /** true bila catatan berisi peringatan atau tebakan, bukan sekadar info */ warn?: boolean; destructive: boolean; status: 'proposed' | 'executed' | 'rejected' | 'undone' | 'failed';
};
export type ActionRow = {
  id: string; tool_name: string; summary: string; permission: 'write' | 'destructive'; status: CardView['status'];
  args: Record<string, unknown>; result?: { doubtful?: string[]; warning?: string | null } | null;
};

const TOOL_LABEL: Record<string, string> = {
  add_transaction: 'Transaksi', add_transfer: 'Transfer', update_transaction: 'Ubah transaksi', delete_transaction: 'Hapus transaksi',
  add_bill: 'Tagihan baru', update_investment: 'Nilai investasi', add_task: 'Tugas baru', complete_task: 'Tandai selesai',
  add_material: 'Materi kuliah', add_course: 'Mata kuliah baru', add_research_target: 'Target riset', update_research_progress: 'Progres riset',
  add_research_idea: 'Ide riset', add_research_need: 'Kebutuhan riset', schedule_task_work: 'Jadwal mengerjakan', add_event: 'Acara',
  save_vocab: 'Kosakata', grade_review: 'Nilai review', create_automation: 'Otomasi baru', toggle_automation: 'Otomasi',
  delete_automation: 'Hapus otomasi', remember: 'Ingat',
};
const TASK_KIND: Record<string, string> = { assignment: 'Tugas baru', exam: 'Ujian baru', quiz: 'Kuis baru', practicum: 'Praktikum baru' };

const rp = (n: unknown) => `Rp${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;
const str = (v: unknown) => (typeof v === 'string' ? v : null);

function dayLabel(iso: string | null, today: string, withTime: boolean): string {
  if (!iso) return 'Tanpa tanggal';
  const p = zonedParts(iso);
  const d = p.date === today ? 'Hari ini' : p.date === addDays(today, 1) ? 'Besok' : p.date === addDays(today, -1) ? 'Kemarin'
    : new Date(`${p.date}T12:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return withTime ? `${d} · ${p.time.replace(':', '.')}` : d;
}

export function cardFor(row: ActionRow, lk: Lookups, today: string): CardView {
  const r = row.args;
  const doubt = new Set(row.result?.doubtful ?? []);
  const name = (list: { id: string; name: string }[], id: unknown, empty: string) => list.find((x) => x.id === id)?.name ?? empty;
  const base = { id: row.id, tool: row.tool_name, status: row.status, destructive: row.permission === 'destructive', note: row.result?.warning ?? undefined, warn: !!row.result?.warning || doubt.size > 0 };
  const segs = row.summary.split(' · ');

  switch (row.tool_name) {
    case 'add_transaction': {
      const kind = r.kind === 'income' ? 'income' : 'expense';
      const occurred = str(r.occurred_at);
      return {
        ...base, icon: kind, kindLabel: kind === 'income' ? 'Pemasukan' : 'Pengeluaran', value: rp(r.amount),
        chips: [
          { label: name(lk.categories, r.category_id, 'Tanpa kategori'), doubtful: doubt.has('category'), field: 'category', edit: kind === 'income' ? 'category_income' : 'category_expense', value: str(r.category_id) ?? '' },
          { label: name(lk.accounts, r.account_id, 'Pilih akun'), doubtful: doubt.has('account'), field: 'account', edit: 'account', value: str(r.account_id) ?? '' },
          { label: dayLabel(occurred, today, false), field: 'occurred_at', edit: 'date', value: occurred ? zonedParts(occurred).date : today },
        ],
        note: [str(r.merchant) ?? str(r.note) ? `Catatan: ${str(r.merchant) ?? str(r.note)}.` : '', base.note ?? ''].filter(Boolean).join(' ') || undefined,
      };
    }
    case 'add_transfer': {
      const occurred = str(r.occurred_at);
      return {
        ...base, icon: 'transfer', kindLabel: 'Transfer', value: rp(r.amount),
        chips: [
          { label: name(lk.accounts, r.from, 'Akun asal'), field: 'from_account', edit: 'account', value: str(r.from) ?? '' },
          { label: `ke ${name(lk.accounts, r.to, 'akun tujuan')}`, field: 'to_account', edit: 'account', value: str(r.to) ?? '' },
          { label: dayLabel(occurred, today, false), field: 'occurred_at', edit: 'date', value: occurred ? zonedParts(occurred).date : today },
        ],
        note: Number(r.fee) > 0 ? `Biaya admin ${rp(r.fee)} dicatat sebagai pengeluaran terpisah.` : base.note,
      };
    }
    case 'add_task': {
      const due = str(r.due_at);
      return {
        ...base, icon: 'task', kindLabel: TASK_KIND[String(r.kind)] ?? 'Tugas baru', value: String(r.title ?? ''),
        chips: [
          { label: name(lk.courses, r.course_id, 'Umum'), field: 'course', edit: 'course', value: str(r.course_id) ?? '' },
          { label: due ? `Tenggat ${dayLabel(due, today, true)}` : 'Tanpa tenggat', field: 'due_at', edit: 'datetime', value: due ? `${zonedParts(due).date}T${zonedParts(due).time}` : '' },
        ],
      };
    }
    case 'add_event':
      return { ...base, icon: 'event', kindLabel: 'Acara', value: String(r.title ?? segs[0]), chips: segs.slice(1).map((label) => ({ label })) };
    case 'add_research_idea':
      return { ...base, icon: 'idea', kindLabel: 'Ide riset', value: String(r.content ?? segs[0]).slice(0, 120), chips: [] };
    case 'add_research_need':
      return { ...base, icon: 'need', kindLabel: 'Kebutuhan riset', value: String(r.item ?? segs[0]), chips: [] };
    case 'save_vocab':
      return { ...base, icon: 'vocab', kindLabel: 'Kosakata', value: String(r.term ?? segs[0]), chips: segs.slice(1).map((label) => ({ label })) };
    default:
      return {
        ...base, icon: base.destructive ? 'delete' : 'other', kindLabel: TOOL_LABEL[row.tool_name] ?? row.tool_name,
        value: segs[0], chips: segs.slice(1).map((label) => ({ label })),
        note: base.destructive ? (base.note ?? 'Aksi ini menghapus atau mengubah data yang sudah ada.') : base.note,
      };
  }
}
