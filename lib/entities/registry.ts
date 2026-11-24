// Daftar entitas untuk formulir generik /catat/[jenis] (Fase 1c, D-31).
// Satu entri = satu tabel: field (untuk UI, harus bisa diserialisasi), skema Zod, dan pemetaan baris.
import { z } from 'zod';
import { zonedParts, zonedToIso } from '../time';
import { f } from './fields';

export type FieldType = 'text' | 'textarea' | 'money' | 'number' | 'range' | 'date' | 'time' | 'select' | 'checkbox' | 'tags' | 'url';
export type OptionSource = 'courses' | 'accounts' | 'expenseCategories' | 'projects' | 'semesters';
export type FieldDef = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  source?: OptionSource;
  emptyLabel?: string;
  placeholder?: string;
  hint?: string;
  half?: boolean;
  min?: number;
  max?: number;
};
export type FormValues = Record<string, string | number | boolean | null | string[]>;
// Klien Supabase minimal yang dipakai hook (hindari ketergantungan tipe ke server.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type EntityDef = {
  key: string;
  table: string;
  label: string;          // "Tugas"
  noun: string;           // "tugas" (untuk teks tombol)
  back: string;           // tujuan setelah simpan/hapus
  backLabel: string;
  fields: FieldDef[];
  schema: z.ZodType<Record<string, unknown>>;
  toRow: (v: Record<string, unknown>) => Record<string, unknown>;
  fromRow?: (row: Record<string, unknown>) => FormValues;
  defaults?: FormValues;
  beforeSave?: (db: Db, v: Record<string, unknown>, id: string | null) => Promise<void>;
  afterSave?: (db: Db, id: string, v: Record<string, unknown>) => Promise<void>;
  loadExtra?: (db: Db, id: string) => Promise<FormValues>;
  canDelete?: (row: Record<string, unknown>) => string | null; // null = boleh, string = alasan tidak boleh
  deleteNote?: string;
};

const opts = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));
const pick = (row: Record<string, unknown>, keys: string[]): FormValues =>
  Object.fromEntries(keys.map((k) => [k, (row[k] ?? null) as FormValues[string]]));

const TASK_KIND = opts([['assignment', 'Tugas'], ['exam', 'Ujian'], ['quiz', 'Kuis'], ['practicum', 'Praktikum']]);
const PRIORITY = opts([['low', 'Rendah'], ['medium', 'Sedang'], ['high', 'Tinggi']]);
const TASK_STATUS = opts([['todo', 'Belum'], ['in_progress', 'Sedang dikerjakan'], ['done', 'Selesai']]);
const WEEKDAY = opts([['1', 'Senin'], ['2', 'Selasa'], ['3', 'Rabu'], ['4', 'Kamis'], ['5', 'Jumat'], ['6', 'Sabtu'], ['7', 'Minggu']]);
const RECURRENCE = opts([['none', 'Tidak berulang'], ['daily', 'Harian'], ['weekly', 'Mingguan'], ['monthly', 'Bulanan'], ['yearly', 'Tahunan']]);
const MATERIAL_KIND = opts([['slide', 'Slide'], ['jurnal', 'Jurnal'], ['video', 'Video'], ['catatan', 'Catatan'], ['buku', 'Buku'], ['lainnya', 'Lainnya']]);
const PROJECT_STATUS = opts([['active', 'Aktif'], ['paused', 'Ditunda'], ['done', 'Selesai']]);
const NEED_KIND = opts([['data', 'Data'], ['alat', 'Alat'], ['izin', 'Izin'], ['akses', 'Akses'], ['literatur', 'Literatur'], ['lainnya', 'Lainnya']]);
const NEED_STATUS = opts([['open', 'Belum'], ['in_progress', 'Sedang diurus'], ['fulfilled', 'Terpenuhi']]);
const IDEA_STATUS = opts([['raw', 'Mentah'], ['viable', 'Layak dikembangkan'], ['discarded', 'Dibuang']]);
const LIT_STATUS = opts([['unchecked', 'Belum dicek'], ['doi_checked', 'DOI dicek'], ['page_checked', 'Halaman dicek'], ['fulltext_read', 'Teks lengkap dibaca']]);
const LIT_INCLUSION = opts([['use', 'Pakai'], ['maybe', 'Ragu'], ['exclude', 'Tidak dipakai']]);
const SUPERVISION_STATUS = opts([['open', 'Belum ditindaklanjuti'], ['done', 'Selesai']]);
const BILL_FREQ = opts([['monthly', 'Bulanan'], ['yearly', 'Tahunan'], ['once', 'Sekali bayar']]);
const DEBT_DIR = opts([['receivable', 'Piutang (orang lain berutang padaku)'], ['payable', 'Utang (aku berutang)']]);
const INSTRUMENT = opts([['reksa dana', 'Reksa dana'], ['saham', 'Saham'], ['emas', 'Emas'], ['obligasi atau SBN', 'Obligasi atau SBN'], ['kripto', 'Kripto'], ['deposito', 'Deposito'], ['lainnya', 'Lainnya']]);
const CATEGORY_KIND = opts([['expense', 'Pengeluaran'], ['income', 'Pemasukan']]);

const values = <T extends { value: string }[]>(o: T) => o.map((x) => x.value) as [string, ...string[]];

const notBefore = (a: string, b: string, msg: string) => (v: Record<string, unknown>, ctx: z.RefinementCtx) => {
  if (v[a] && v[b] && String(v[b]) < String(v[a])) ctx.addIssue({ code: 'custom', path: [b], message: msg });
};

/* ================= Kuliah ================= */

const task: EntityDef = {
  key: 'tugas', table: 'tasks', label: 'Tugas', noun: 'tugas', back: '/kuliah', backLabel: 'Kuliah',
  fields: [
    { name: 'title', label: 'Judul', type: 'text', required: true, placeholder: 'Laporan praktikum 3' },
    { name: 'course_id', label: 'Mata kuliah', type: 'select', source: 'courses', emptyLabel: 'Tugas umum', half: true },
    { name: 'kind', label: 'Jenis', type: 'select', options: TASK_KIND, half: true },
    { name: 'due_date', label: 'Tenggat', type: 'date', half: true },
    { name: 'due_time', label: 'Jam tenggat', type: 'time', half: true, hint: 'Kosong = 23.59' },
    { name: 'priority', label: 'Prioritas', type: 'select', options: PRIORITY, half: true },
    { name: 'status', label: 'Status', type: 'select', options: TASK_STATUS, half: true },
    { name: 'work_date', label: 'Rencana dikerjakan', type: 'date', half: true, hint: 'Opsional, tampil di Agenda' },
    { name: 'work_start', label: 'Mulai', type: 'time', half: true },
    { name: 'work_end', label: 'Selesai', type: 'time', half: true },
    { name: 'url', label: 'Tautan', type: 'url' },
    { name: 'description', label: 'Catatan', type: 'textarea' },
  ],
  defaults: { kind: 'assignment', priority: 'medium', status: 'todo' },
  schema: z.object({
    title: f.text('Judul', 160), course_id: f.optUuid(), kind: f.choice(values(TASK_KIND)), priority: f.choice(values(PRIORITY)),
    status: f.choice(values(TASK_STATUS)), due_date: f.optDate(), due_time: f.optTime(), work_date: f.optDate(),
    work_start: f.optTime(), work_end: f.optTime(), url: f.optText(500), description: f.optText(2000),
  }).superRefine(notBefore('work_start', 'work_end', 'Jam selesai harus setelah jam mulai.')),
  toRow: (v) => ({
    title: v.title, course_id: v.course_id, kind: v.kind, priority: v.priority, status: v.status, url: v.url, description: v.description,
    due_at: v.due_date ? zonedToIso(String(v.due_date), String(v.due_time ?? '23:59')) : null,
    completed_at: v.status === 'done' ? new Date().toISOString() : null,
  }),
  fromRow: (r) => {
    const due = r.due_at ? zonedParts(String(r.due_at)) : null;
    return { ...pick(r, ['title', 'course_id', 'kind', 'priority', 'status', 'url', 'description']), due_date: due?.date ?? null, due_time: due?.time ?? null };
  },
  loadExtra: async (db, id): Promise<FormValues> => {
    const { data } = await db.from('task_work_slots').select('start_at,end_at').eq('task_id', id).eq('suggested_by_agent', false).order('start_at').limit(1).maybeSingle();
    if (!data) return {};
    const s = zonedParts(data.start_at); const e = zonedParts(data.end_at);
    return { work_date: s.date, work_start: s.time, work_end: e.time };
  },
  afterSave: async (db, id, v) => {
    await db.from('task_work_slots').delete().eq('task_id', id).eq('suggested_by_agent', false);
    if (!v.work_date) return;
    const start = zonedToIso(String(v.work_date), String(v.work_start ?? '19:00'));
    const end = v.work_end ? zonedToIso(String(v.work_date), String(v.work_end)) : new Date(new Date(start).getTime() + 2 * 3600_000).toISOString();
    await db.from('task_work_slots').insert({ task_id: id, start_at: start, end_at: end > start ? end : new Date(new Date(start).getTime() + 3600_000).toISOString() });
  },
};

const course: EntityDef = {
  key: 'matkul', table: 'courses', label: 'Mata kuliah', noun: 'mata kuliah', back: '/kuliah', backLabel: 'Kuliah',
  fields: [
    { name: 'name', label: 'Nama', type: 'text', required: true, placeholder: 'Statistika' },
    { name: 'alias', label: 'Singkatan', type: 'text', half: true, placeholder: 'STAT', hint: 'Dipakai pengurai: "tugas STAT jumat"' },
    { name: 'code', label: 'Kode', type: 'text', half: true },
    { name: 'credits', label: 'SKS', type: 'number', half: true, min: 0, max: 12 },
    { name: 'semester_id', label: 'Semester', type: 'select', source: 'semesters', emptyLabel: 'Tanpa semester', half: true },
    { name: 'lecturer', label: 'Dosen', type: 'text', half: true },
    { name: 'room', label: 'Ruang', type: 'text', half: true },
    { name: 'note', label: 'Catatan', type: 'textarea' },
  ],
  schema: z.object({
    name: f.text('Nama', 120), alias: f.optText(40), code: f.optText(30), credits: f.optInt(0, 12), semester_id: f.optUuid(),
    lecturer: f.optText(120), room: f.optText(60), note: f.optText(1000),
  }),
  toRow: (v) => v,
  fromRow: (r) => pick(r, ['name', 'alias', 'code', 'credits', 'semester_id', 'lecturer', 'room', 'note']),
  deleteNote: 'Jadwal kelas mata kuliah ini ikut terhapus. Tugas dan materinya tetap ada tanpa mata kuliah.',
};

const schedule: EntityDef = {
  key: 'jadwal', table: 'course_schedules', label: 'Jadwal kelas', noun: 'jadwal', back: '/kuliah', backLabel: 'Kuliah',
  fields: [
    { name: 'course_id', label: 'Mata kuliah', type: 'select', source: 'courses', required: true },
    { name: 'weekday', label: 'Hari', type: 'select', options: WEEKDAY, required: true },
    { name: 'start_time', label: 'Mulai', type: 'time', required: true, half: true },
    { name: 'end_time', label: 'Selesai', type: 'time', required: true, half: true },
    { name: 'location', label: 'Ruang', type: 'text' },
  ],
  defaults: { weekday: '1' },
  schema: z.object({
    course_id: f.uuid('mata kuliah'), weekday: f.int('Hari', 1, 7), start_time: f.time('Jam mulai'), end_time: f.time('Jam selesai'), location: f.optText(60),
  }).superRefine((v, ctx) => { if (v.end_time <= v.start_time) ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'Jam selesai harus setelah jam mulai.' }); }),
  toRow: (v) => v,
  fromRow: (r) => ({ ...pick(r, ['course_id', 'location']), weekday: String(r.weekday), start_time: String(r.start_time).slice(0, 5), end_time: String(r.end_time).slice(0, 5) }),
};

const material: EntityDef = {
  key: 'materi', table: 'materials', label: 'Materi', noun: 'materi', back: '/kuliah', backLabel: 'Kuliah',
  fields: [
    { name: 'title', label: 'Judul', type: 'text', required: true },
    { name: 'course_id', label: 'Mata kuliah', type: 'select', source: 'courses', emptyLabel: 'Tanpa mata kuliah', half: true },
    { name: 'meeting', label: 'Pertemuan ke', type: 'number', half: true, min: 1, max: 32 },
    { name: 'kind', label: 'Jenis', type: 'select', options: MATERIAL_KIND, emptyLabel: 'Pilih jenis', half: true },
    { name: 'url', label: 'Tautan', type: 'url', half: true },
    { name: 'tags', label: 'Tag (pisahkan dengan koma)', type: 'tags' },
    { name: 'notes', label: 'Catatan', type: 'textarea' },
  ],
  schema: z.object({
    title: f.text('Judul', 200), course_id: f.optUuid(), meeting: f.optInt(1, 32), kind: f.optChoice(values(MATERIAL_KIND)),
    url: f.optText(500), tags: f.tags(), notes: f.optText(2000),
  }),
  toRow: (v) => v,
  fromRow: (r) => pick(r, ['title', 'course_id', 'meeting', 'kind', 'url', 'tags', 'notes']),
};

const semester: EntityDef = {
  key: 'semester', table: 'semesters', label: 'Semester', noun: 'semester', back: '/kuliah', backLabel: 'Kuliah',
  fields: [
    { name: 'number', label: 'Semester ke', type: 'number', required: true, half: true, min: 1, max: 16 },
    { name: 'name', label: 'Nama', type: 'text', half: true, placeholder: 'Kosong = "Semester N"' },
    { name: 'start_date', label: 'Mulai', type: 'date', half: true },
    { name: 'end_date', label: 'Selesai', type: 'date', half: true },
    { name: 'is_active', label: 'Semester aktif (jadwal kelas tampil di Agenda)', type: 'checkbox' },
  ],
  defaults: { is_active: true },
  schema: z.object({
    number: f.int('Semester', 1, 16), name: f.optText(40), start_date: f.optDate(), end_date: f.optDate(), is_active: f.bool(),
  }).superRefine(notBefore('start_date', 'end_date', 'Tanggal selesai harus setelah tanggal mulai.')),
  toRow: (v) => ({ ...v, name: v.name ?? `Semester ${v.number}` }),
  fromRow: (r) => pick(r, ['number', 'name', 'start_date', 'end_date', 'is_active']),
  beforeSave: async (db, v, id) => {
    if (!v.is_active) return;
    let q = db.from('semesters').update({ is_active: false }).eq('is_active', true);
    if (id) q = q.neq('id', id);
    await q;
  },
  deleteNote: 'Mata kuliah di semester ini tetap ada tanpa semester.',
};

/* ================= Kalender ================= */

const event: EntityDef = {
  key: 'acara', table: 'events', label: 'Acara', noun: 'acara', back: '/kalender', backLabel: 'Agenda',
  fields: [
    { name: 'title', label: 'Judul', type: 'text', required: true, placeholder: 'Rapat kelompok' },
    { name: 'date', label: 'Tanggal', type: 'date', required: true, half: true },
    { name: 'start_time', label: 'Jam mulai', type: 'time', half: true, hint: 'Kosong = sepanjang hari' },
    { name: 'end_date', label: 'Sampai tanggal', type: 'date', half: true, hint: 'Untuk acara beberapa hari' },
    { name: 'end_time', label: 'Jam selesai', type: 'time', half: true },
    { name: 'location', label: 'Tempat', type: 'text' },
    { name: 'recurrence', label: 'Berulang', type: 'select', options: RECURRENCE, half: true },
    { name: 'recurrence_until', label: 'Berulang sampai', type: 'date', half: true },
    { name: 'notes', label: 'Catatan', type: 'textarea' },
  ],
  defaults: { recurrence: 'none' },
  schema: z.object({
    title: f.text('Judul', 160), date: f.date('Tanggal'), start_time: f.optTime(), end_date: f.optDate(), end_time: f.optTime(),
    location: f.optText(120), recurrence: f.choice(values(RECURRENCE)), recurrence_until: f.optDate(), notes: f.optText(2000),
  }).superRefine((v, ctx) => {
    if (v.end_date && v.end_date < v.date) ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'Tanggal selesai harus setelah tanggal mulai.' });
    if (!v.end_date && v.start_time && v.end_time && v.end_time < v.start_time) ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'Jam selesai harus setelah jam mulai.' });
  }),
  toRow: (v) => ({
    title: v.title, location: v.location, recurrence: v.recurrence, recurrence_until: v.recurrence_until, notes: v.notes,
    start_at: zonedToIso(String(v.date), String(v.start_time ?? '00:00')),
    is_all_day: !v.start_time,
    end_at: v.end_date || v.end_time ? zonedToIso(String(v.end_date ?? v.date), String(v.end_time ?? '23:59')) : null,
  }),
  fromRow: (r) => {
    const s = zonedParts(String(r.start_at));
    const e = r.end_at ? zonedParts(String(r.end_at)) : null;
    return {
      ...pick(r, ['title', 'location', 'recurrence', 'recurrence_until', 'notes']),
      date: s.date, start_time: r.is_all_day ? null : s.time,
      end_date: e && e.date !== s.date ? e.date : null, end_time: e && !(r.is_all_day && e.time === '23:59') ? e.time : null,
    };
  },
};

const holiday: EntityDef = {
  key: 'libur', table: 'holidays', label: 'Libur', noun: 'libur', back: '/kalender', backLabel: 'Agenda',
  fields: [
    { name: 'name', label: 'Nama', type: 'text', required: true, placeholder: 'Libur semester' },
    { name: 'start_date', label: 'Mulai', type: 'date', required: true, half: true },
    { name: 'end_date', label: 'Sampai', type: 'date', half: true },
  ],
  schema: z.object({ name: f.text('Nama', 80), start_date: f.date('Tanggal mulai'), end_date: f.optDate() })
    .superRefine(notBefore('start_date', 'end_date', 'Tanggal selesai harus setelah tanggal mulai.')),
  toRow: (v) => v,
  fromRow: (r) => pick(r, ['name', 'start_date', 'end_date']),
};

/* ================= Riset ================= */

const project: EntityDef = {
  key: 'proyek', table: 'research_projects', label: 'Proyek riset', noun: 'proyek', back: '/riset', backLabel: 'Riset',
  fields: [
    { name: 'title', label: 'Judul', type: 'text', required: true, placeholder: 'Skripsi' },
    { name: 'status', label: 'Status', type: 'select', options: PROJECT_STATUS },
    { name: 'description', label: 'Deskripsi', type: 'textarea' },
  ],
  defaults: { status: 'active' },
  schema: z.object({ title: f.text('Judul', 160), status: f.choice(values(PROJECT_STATUS)), description: f.optText(2000) }),
  toRow: (v) => v,
  fromRow: (r) => pick(r, ['title', 'status', 'description']),
  deleteNote: 'Target dan kebutuhan proyek ini ikut terhapus. Ide dan literatur tetap ada tanpa proyek.',
};

const target: EntityDef = {
  key: 'target', table: 'research_targets', label: 'Target riset', noun: 'target', back: '/riset', backLabel: 'Riset',
  fields: [
    { name: 'title', label: 'Judul', type: 'text', required: true, placeholder: 'Draf Bab II' },
    { name: 'project_id', label: 'Proyek', type: 'select', source: 'projects', emptyLabel: 'Tanpa proyek', half: true },
    { name: 'due_date', label: 'Tenggat', type: 'date', half: true },
    { name: 'progress', label: 'Progres (%)', type: 'range', min: 0, max: 100 },
    { name: 'note', label: 'Catatan', type: 'textarea' },
  ],
  defaults: { progress: 0 },
  schema: z.object({ title: f.text('Judul', 160), project_id: f.optUuid(), due_date: f.optDate(), progress: f.int('Progres', 0, 100), note: f.optText(2000) }),
  toRow: (v) => ({ ...v, last_touched_at: new Date().toISOString() }),
  fromRow: (r) => pick(r, ['title', 'project_id', 'due_date', 'progress', 'note']),
};

const need: EntityDef = {
  key: 'kebutuhan', table: 'research_needs', label: 'Kebutuhan riset', noun: 'kebutuhan', back: '/riset', backLabel: 'Riset',
  fields: [
    { name: 'item', label: 'Kebutuhan', type: 'text', required: true, placeholder: 'Izin akses data BIG' },
    { name: 'project_id', label: 'Proyek', type: 'select', source: 'projects', emptyLabel: 'Tanpa proyek', half: true },
    { name: 'kind', label: 'Jenis', type: 'select', options: NEED_KIND, emptyLabel: 'Pilih jenis', half: true },
    { name: 'status', label: 'Status', type: 'select', options: NEED_STATUS },
    { name: 'note', label: 'Catatan', type: 'textarea' },
  ],
  defaults: { status: 'open' },
  schema: z.object({ item: f.text('Kebutuhan', 200), project_id: f.optUuid(), kind: f.optChoice(values(NEED_KIND)), status: f.choice(values(NEED_STATUS)), note: f.optText(2000) }),
  toRow: (v) => v,
  fromRow: (r) => pick(r, ['item', 'project_id', 'kind', 'status', 'note']),
};

const idea: EntityDef = {
  key: 'ide', table: 'research_ideas', label: 'Ide riset', noun: 'ide', back: '/riset', backLabel: 'Riset',
  fields: [
    { name: 'content', label: 'Ide', type: 'textarea', required: true },
    { name: 'source', label: 'Asal ide', type: 'text', half: true, placeholder: 'Dosen, paper, diskusi' },
    { name: 'status', label: 'Status', type: 'select', options: IDEA_STATUS, half: true },
    { name: 'project_id', label: 'Proyek', type: 'select', source: 'projects', emptyLabel: 'Tanpa proyek' },
    { name: 'note', label: 'Catatan', type: 'textarea' },
  ],
  defaults: { status: 'raw' },
  schema: z.object({ content: f.text('Ide', 1000), source: f.optText(120), status: f.choice(values(IDEA_STATUS)), project_id: f.optUuid(), note: f.optText(2000) }),
  toRow: (v) => v,
  fromRow: (r) => pick(r, ['content', 'source', 'status', 'project_id', 'note']),
};

const reading: EntityDef = {
  key: 'literatur', table: 'readings', label: 'Literatur', noun: 'literatur', back: '/riset', backLabel: 'Riset',
  fields: [
    { name: 'title', label: 'Judul', type: 'text', required: true },
    { name: 'authors', label: 'Penulis', type: 'text', half: true },
    { name: 'year', label: 'Tahun', type: 'number', half: true, min: 1900, max: 2100 },
    { name: 'venue', label: 'Jurnal atau penerbit', type: 'text', half: true },
    { name: 'doi', label: 'DOI', type: 'text', half: true, placeholder: '10.xxxx/xxxx', hint: 'Tanpa https://doi.org/' },
    { name: 'verification_status', label: 'Status verifikasi', type: 'select', options: LIT_STATUS, half: true },
    { name: 'inclusion', label: 'Keputusan', type: 'select', options: LIT_INCLUSION, emptyLabel: 'Belum diputuskan', half: true },
    { name: 'project_id', label: 'Proyek', type: 'select', source: 'projects', emptyLabel: 'Tanpa proyek', half: true },
    { name: 'collection', label: 'Koleksi', type: 'text', half: true },
    { name: 'url', label: 'Tautan', type: 'url' },
    { name: 'tags', label: 'Tag (pisahkan dengan koma)', type: 'tags' },
    { name: 'claim', label: 'Klaim utama', type: 'textarea' },
    { name: 'notes', label: 'Catatan', type: 'textarea' },
  ],
  defaults: { verification_status: 'unchecked' },
  schema: z.object({
    title: f.text('Judul', 300), authors: f.optText(300), year: f.optInt(1900, 2100), venue: f.optText(200),
    doi: z.preprocess((v) => (typeof v === 'string' ? v.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') : v), f.optText(200)),
    verification_status: f.choice(values(LIT_STATUS)), inclusion: f.optChoice(values(LIT_INCLUSION)), project_id: f.optUuid(),
    collection: f.optText(120), url: f.optText(500), tags: f.tags(), claim: f.optText(2000), notes: f.optText(4000),
  }),
  toRow: (v) => v,
  fromRow: (r) => pick(r, ['title', 'authors', 'year', 'venue', 'doi', 'verification_status', 'inclusion', 'project_id', 'collection', 'url', 'tags', 'claim', 'notes']),
};

const supervision: EntityDef = {
  key: 'bimbingan', table: 'supervisions', label: 'Bimbingan', noun: 'bimbingan', back: '/riset', backLabel: 'Riset',
  fields: [
    { name: 'met_on', label: 'Tanggal bimbingan', type: 'date', half: true },
    { name: 'supervisor', label: 'Dengan', type: 'text', half: true, placeholder: 'Pak/Bu ...' },
    { name: 'points', label: 'Poin bimbingan', type: 'textarea' },
    { name: 'status', label: 'Tindak lanjut', type: 'select', options: SUPERVISION_STATUS, half: true },
    { name: 'next_on', label: 'Bimbingan berikutnya', type: 'date', half: true },
  ],
  defaults: { status: 'open' },
  schema: z.object({ met_on: f.optDate(), supervisor: f.optText(120), points: f.optText(4000), status: f.choice(values(SUPERVISION_STATUS)), next_on: f.optDate() }),
  toRow: (v) => v,
  fromRow: (r) => pick(r, ['met_on', 'supervisor', 'points', 'status', 'next_on']),
};

/* ================= Keuangan ================= */

const bill: EntityDef = {
  key: 'tagihan', table: 'bills', label: 'Tagihan', noun: 'tagihan', back: '/keuangan?tab=rencana', backLabel: 'Uang',
  fields: [
    { name: 'name', label: 'Nama', type: 'text', required: true, placeholder: 'Wifi' },
    { name: 'amount', label: 'Nominal', type: 'money', required: true, half: true },
    { name: 'frequency', label: 'Frekuensi', type: 'select', options: BILL_FREQ, half: true },
    { name: 'next_due_date', label: 'Jatuh tempo berikutnya', type: 'date', required: true, half: true },
    { name: 'default_account_id', label: 'Bayar dari akun', type: 'select', source: 'accounts', emptyLabel: 'Belum diatur', half: true },
    { name: 'category_id', label: 'Kategori', type: 'select', source: 'expenseCategories', emptyLabel: 'Tanpa kategori', half: true },
    { name: 'is_active', label: 'Aktif (tampil di pengingat)', type: 'checkbox' },
    { name: 'note', label: 'Catatan', type: 'textarea' },
  ],
  defaults: { frequency: 'monthly', is_active: true },
  schema: z.object({
    name: f.text('Nama', 80), amount: f.money('Nominal'), frequency: f.choice(values(BILL_FREQ)), next_due_date: f.date('Jatuh tempo'),
    default_account_id: f.optUuid(), category_id: f.optUuid(), is_active: f.bool(), note: f.optText(1000),
  }),
  toRow: (v) => ({
    ...v,
    due_day: v.frequency === 'monthly' ? Number(String(v.next_due_date).slice(8)) : null,
    due_date: v.frequency === 'monthly' ? null : v.next_due_date,
    is_recurring: v.frequency !== 'once',
  }),
  fromRow: (r) => pick(r, ['name', 'amount', 'frequency', 'next_due_date', 'default_account_id', 'category_id', 'is_active', 'note']),
};

const debt: EntityDef = {
  key: 'utang', table: 'debts', label: 'Utang atau piutang', noun: 'utang/piutang', back: '/keuangan?tab=rencana', backLabel: 'Uang',
  fields: [
    { name: 'direction', label: 'Jenis', type: 'select', options: DEBT_DIR },
    { name: 'person', label: 'Nama orang', type: 'text', required: true },
    { name: 'amount', label: 'Jumlah', type: 'money', required: true, half: true },
    { name: 'paid_amount', label: 'Sudah dibayar', type: 'money', half: true },
    { name: 'occurred_on', label: 'Tanggal pinjam', type: 'date', half: true },
    { name: 'due_on', label: 'Jatuh tempo', type: 'date', half: true },
    { name: 'note', label: 'Catatan', type: 'textarea' },
  ],
  defaults: { direction: 'receivable', paid_amount: 0 },
  schema: z.object({
    direction: f.choice(values(DEBT_DIR)), person: f.text('Nama', 80), amount: f.money('Jumlah'), paid_amount: f.money('Sudah dibayar'),
    occurred_on: f.optDate(), due_on: f.optDate(), note: f.optText(1000),
  }).superRefine((v, ctx) => { if (v.paid_amount > v.amount) ctx.addIssue({ code: 'custom', path: ['paid_amount'], message: 'Tidak boleh melebihi jumlah.' }); }),
  toRow: (v) => v,
  fromRow: (r) => pick(r, ['direction', 'person', 'amount', 'paid_amount', 'occurred_on', 'due_on', 'note']),
};

const goal: EntityDef = {
  key: 'tabungan', table: 'savings_goals', label: 'Target tabungan', noun: 'target tabungan', back: '/keuangan?tab=rencana', backLabel: 'Uang',
  fields: [
    { name: 'name', label: 'Nama', type: 'text', required: true, placeholder: 'Laptop baru' },
    { name: 'target_amount', label: 'Target', type: 'money', required: true, half: true },
    { name: 'saved_amount', label: 'Sudah terkumpul', type: 'money', half: true },
    { name: 'deadline', label: 'Tenggat', type: 'date', half: true },
    { name: 'note', label: 'Catatan', type: 'textarea' },
  ],
  defaults: { saved_amount: 0 },
  schema: z.object({ name: f.text('Nama', 80), target_amount: f.money('Target'), saved_amount: f.money('Terkumpul'), deadline: f.optDate(), note: f.optText(1000) }),
  toRow: (v) => v,
  fromRow: (r) => pick(r, ['name', 'target_amount', 'saved_amount', 'deadline', 'note']),
};

const sinking: EntityDef = {
  key: 'biaya-sejati', table: 'sinking_funds', label: 'Biaya sejati', noun: 'biaya sejati', back: '/keuangan?tab=rencana', backLabel: 'Uang',
  fields: [
    { name: 'name', label: 'Nama', type: 'text', required: true, placeholder: 'UKT semester depan' },
    { name: 'amount', label: 'Total biaya', type: 'money', required: true, half: true },
    { name: 'saved_amount', label: 'Sudah disisihkan', type: 'money', half: true },
    { name: 'due_on', label: 'Dibutuhkan tanggal', type: 'date', half: true },
    { name: 'is_done', label: 'Sudah selesai', type: 'checkbox' },
    { name: 'note', label: 'Catatan', type: 'textarea' },
  ],
  defaults: { saved_amount: 0, is_done: false },
  schema: z.object({ name: f.text('Nama', 80), amount: f.money('Total biaya'), saved_amount: f.money('Disisihkan'), due_on: f.optDate(), is_done: f.bool(), note: f.optText(1000) }),
  toRow: (v) => v,
  fromRow: (r) => pick(r, ['name', 'amount', 'saved_amount', 'due_on', 'is_done', 'note']),
};

const investment: EntityDef = {
  key: 'investasi', table: 'investments', label: 'Investasi', noun: 'investasi', back: '/keuangan?tab=investasi', backLabel: 'Uang',
  fields: [
    { name: 'name', label: 'Nama', type: 'text', required: true, placeholder: 'Reksa dana pasar uang' },
    { name: 'instrument', label: 'Jenis', type: 'select', options: INSTRUMENT, half: true },
    { name: 'platform', label: 'Platform', type: 'text', half: true },
    { name: 'invested_amount', label: 'Modal', type: 'money', half: true },
    { name: 'current_value', label: 'Nilai sekarang', type: 'money', half: true },
    { name: 'valued_at', label: 'Nilai per tanggal', type: 'date', half: true },
    { name: 'note', label: 'Catatan', type: 'textarea' },
  ],
  defaults: { instrument: 'reksa dana' },
  schema: z.object({
    name: f.text('Nama', 120), instrument: f.choice(values(INSTRUMENT)), platform: f.optText(80), invested_amount: f.optMoney(),
    current_value: f.optMoney(), valued_at: f.optDate(), note: f.optText(1000),
  }),
  toRow: (v) => v,
  fromRow: (r) => pick(r, ['name', 'instrument', 'platform', 'invested_amount', 'current_value', 'valued_at', 'note']),
};

const category: EntityDef = {
  key: 'kategori', table: 'categories', label: 'Kategori', noun: 'kategori', back: '/pengaturan/kategori', backLabel: 'Kategori',
  fields: [
    { name: 'name', label: 'Nama', type: 'text', required: true },
    { name: 'kind', label: 'Jenis', type: 'select', options: CATEGORY_KIND, half: true },
    { name: 'monthly_budget', label: 'Budget per bulan', type: 'money', half: true, hint: 'Kosong = tanpa budget' },
    { name: 'keywords', label: 'Kata kunci (pisahkan dengan koma)', type: 'tags', hint: 'Dipakai pengurai lokal untuk menebak kategori' },
    { name: 'subcategories', label: 'Sub-kategori (pisahkan dengan koma)', type: 'tags' },
    { name: 'is_hidden', label: 'Sembunyikan dari pilihan', type: 'checkbox' },
  ],
  defaults: { kind: 'expense' },
  schema: z.object({
    name: f.text('Nama', 60), kind: f.choice(values(CATEGORY_KIND)), monthly_budget: f.optMoney(), keywords: f.tags(),
    subcategories: f.tags(), is_hidden: f.bool(),
  }),
  toRow: (v) => ({ ...v, monthly_budget: v.monthly_budget ? v.monthly_budget : null }),
  fromRow: (r) => pick(r, ['name', 'kind', 'monthly_budget', 'keywords', 'subcategories', 'is_hidden']),
  canDelete: (r) => (r.is_default ? 'Kategori bawaan tidak bisa dihapus. Sembunyikan saja kalau tidak dipakai.' : null),
  deleteNote: 'Transaksi di kategori ini tetap ada tanpa kategori.',
};

export const ENTITIES: Record<string, EntityDef> = Object.fromEntries(
  [task, course, schedule, material, semester, event, holiday, project, target, need, idea, reading, supervision, bill, debt, goal, sinking, investment, category]
    .map((e) => [e.key, e]),
);

export function getEntity(key: string): EntityDef | null {
  return Object.prototype.hasOwnProperty.call(ENTITIES, key) ? ENTITIES[key] : null;
}

/** Ubah FormData menjadi objek; field tags/checkbox ditangani skema. */
export function formDataToObject(fd: FormData, def: EntityDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of def.fields) out[field.name] = fd.get(field.name) ?? (field.type === 'checkbox' ? '' : '');
  return out;
}

/** Tanggal jatuh tempo tagihan berikutnya setelah dibayar. */
export function nextBillDate(current: string, frequency: string): string | null {
  if (frequency === 'once') return null;
  const [y, m, d] = current.split('-').map(Number);
  const add = frequency === 'yearly' ? 12 : 1;
  const target = new Date(Date.UTC(y, m - 1 + add, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

