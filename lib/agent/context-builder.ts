// Konteks sistem (SPEC 6.5), snapshot (6.6), dan memori relevan (6.7) untuk setiap panggilan agen.
// Penyusun teks adalah fungsi murni (diuji). Pemuat data memakai klien Supabase pengguna (RLS).
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCalendarItems, type CalendarSources } from '../calendar';
import { formatRp } from '../format';
import { addDays, diffDays, zonedParts, zonedToIso } from '../time';
import { normalize } from './resolve';

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export type ContextData = {
  now: Date;
  today: string;
  accounts: { id: string; name: string; type: string; aliases: string[]; balance: number }[];
  categories: { id: string; name: string; kind: string; monthly_budget: number | null; is_hidden: boolean }[];
  courses: { id: string; name: string; alias: string | null; code: string | null }[];
  projects: { id: string; title: string; status: string }[];
  monthSpend: Record<string, number>; // category_id → pengeluaran bulan ini
  bills: { name: string; amount: number; next_due_date: string }[];
  classesToday: { course: string; start: string; end: string; location: string | null }[];
  classesTomorrow: { course: string; start: string; end: string; location: string | null }[];
  tasks: { title: string; due_at: string; course: string | null; kind: string }[];
  targets: { title: string; progress: number; last_touched_at: string | null; due_date: string | null }[];
  vocabDue: number;
  studyStreak: number;
  englishMode: boolean;
};

export type MemoryItem = { id: string; kind: string; key: string; value: unknown };

/** Konteks sistem berbahasa Indonesia, disusun dinamis dari database. */
export function buildSystemPrompt(d: ContextData): string {
  const { date, time } = zonedParts(d.now);
  const wd = DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
  const accounts = d.accounts.map((a) => `${a.name} (${a.type}${a.aliases.length ? `; alias: ${a.aliases.join(', ')}` : ''})`).join('; ') || '(belum ada akun)';
  const cat = (k: string) => d.categories.filter((c) => c.kind === k && !c.is_hidden).map((c) => c.name).join(', ');
  const courses = d.courses.map((c) => `${c.name}${c.alias ? ` (${c.alias})` : ''}`).join('; ') || '(belum ada)';
  const projects = d.projects.filter((p) => p.status === 'active').map((p) => p.title).join('; ') || '(belum ada)';
  return [
    'Kamu Ra, asisten pribadi di app Kompas milik seorang mahasiswa. Bahasa Indonesia santai, singkat, tidak bertele-tele.',
    `Sekarang ${wd}, ${date} pukul ${time} WIB (Asia/Jakarta). Hitung "besok", "Jumat", "tadi siang", "minggu depan" dari waktu ini.`,
    '',
    'MODUL: Kuliah (mata kuliah, jadwal, tugas dan tenggat, materi), Riset (proyek, target dan progres, kebutuhan, ide, literatur), Keuangan (akun, transaksi, transfer, tagihan, budget, investasi), Kalender (gabungan semua), Bahasa Inggris (kosakata, koreksi tulisan), Otomasi.',
    `AKUN: ${accounts}`,
    `KATEGORI PENGELUARAN: ${cat('expense')}`,
    `KATEGORI PEMASUKAN: ${cat('income')}`,
    `MATA KULIAH SEMESTER AKTIF: ${courses}`,
    `PROYEK RISET AKTIF: ${projects}`,
    '',
    'ATURAN:',
    '- Nominal: "30rb"/"30k" = 30000, "goceng" = 5000, "ceban" = 10000, "1,2 jt" = 1200000, "satu setengah juta" = 1500000. Kirim sebagai angka integer rupiah.',
    '- Satu kalimat boleh berisi beberapa aksi: panggil tool untuk setiap aksi.',
    '- Transfer antar akun sendiri (pindah, tarik tunai, setor, top up) pakai add_transfer, bukan pengeluaran.',
    '- Bila akun tidak disebut dan tidak ada di memori, kosongkan parameter account. Tool memilih akun yang paling sering dipakai dan menandainya.',
    '- Tool tulis tidak langsung dijalankan: hasilnya "menunggu_konfirmasi" dan pengguna menyetujui lewat kartu. Jangan bilang data sudah tersimpan.',
    '- Bila tool mengembalikan candidates (nama ambigu), tanyakan pengguna yang mana. Jangan menebak.',
    '- Jangan mengarang angka. Selalu panggil tool baca sebelum menjawab pertanyaan tentang data.',
    '- Tenggat tanpa jam = 23:59. "Jam 12 malam" = 23:59 hari itu.',
    '- Setelah memanggil tool, tutup dengan satu kalimat pendek. Jangan ulangi isi kartu.',
    '- Pesan berawalan [gambar] membawa gambar (screenshot web kampus/LMS, jadwal, pengumuman, catatan). Baca isinya lalu panggil tool yang sesuai: add_task untuk tugas/ujian/kuis dengan tenggat, add_event untuk acara, add_material untuk materi, add_research_target/add_research_idea untuk riset, add_transaction untuk pengeluaran. Satu gambar boleh berisi beberapa tugas: usulkan semuanya.',
    '- Dari gambar: cocokkan nama mata kuliah dengan daftar MATA KULIAH (nama di LMS bisa berbeda, mis. kode atau nama panjang). Jangan mengarang tanggal atau jam yang tidak terlihat. Bila tahun tidak tertulis, pakai tanggal terdekat ke depan. Tulis deskripsi singkat dari isi gambar.',
    '- Pesan berawalan [pesan suara] adalah transkrip otomatis. Pahami salah dengar dari konteks (mis. "go pay" = GoPay, "tiga puluh ribu" = 30000).',
    d.englishMode
      ? '- English Mode aktif: pengguna boleh menulis dalam bahasa Inggris. Tetap jalankan permintaannya.'
      : '',
  ].filter((l) => l !== '').join('\n');
}

/** Ringkasan kondisi terkini (target di bawah 1.500 token). */
export function buildSnapshot(d: ContextData): string {
  const ready = d.accounts.filter((a) => a.type !== 'investment').reduce((n, a) => n + a.balance, 0);
  const lines: string[] = ['SNAPSHOT:'];
  lines.push(`Saldo: ${d.accounts.map((a) => `${a.name} ${formatRp(a.balance)}`).join(', ') || '-'}. Uang siap pakai ${formatRp(ready)}.`);
  const spend = d.categories
    .filter((c) => c.kind === 'expense' && (d.monthSpend[c.id] || c.monthly_budget))
    .map((c) => `${c.name} ${formatRp(d.monthSpend[c.id] ?? 0)}${c.monthly_budget ? `/${formatRp(c.monthly_budget)}` : ''}`)
    .slice(0, 12);
  lines.push(`Pengeluaran bulan ini (terpakai/budget): ${spend.join(', ') || '-'}.`);
  lines.push(`Tagihan 7 hari: ${d.bills.map((b) => `${b.name} ${formatRp(b.amount)} ${b.next_due_date}`).join(', ') || '-'}.`);
  const cls = (l: ContextData['classesToday']) => l.map((c) => `${c.start}-${c.end} ${c.course}${c.location ? ` (${c.location})` : ''}`).join(', ') || '-';
  lines.push(`Kuliah hari ini: ${cls(d.classesToday)}. Besok: ${cls(d.classesTomorrow)}.`);
  lines.push(`Tugas 14 hari: ${d.tasks.slice(0, 12).map((t) => `${t.title}${t.course ? ` [${t.course}]` : ''} ${zonedParts(t.due_at).date}`).join('; ') || '-'}.`);
  const tgt = d.targets.filter((t) => t.progress < 100).slice(0, 8)
    .map((t) => `${t.title} ${t.progress}%${t.last_touched_at ? ` (${diffDays(d.today, zonedParts(t.last_touched_at).date)} hari tak disentuh)` : ''}`);
  lines.push(`Target riset: ${tgt.join('; ') || '-'}.`);
  lines.push(`Kosakata jatuh tempo: ${d.vocabDue}. Streak belajar: ${d.studyStreak} hari.`);
  return lines.join('\n');
}

/** Memori relevan: semua alias, habit, preference; merchant_rule dan correction yang katanya muncul di input. */
export function selectMemory(all: MemoryItem[], input: string): MemoryItem[] {
  const text = ` ${normalize(input)} `;
  return all.filter((m) => {
    if (['alias', 'habit', 'preference'].includes(m.kind)) return true;
    const k = normalize(m.key);
    return !!k && text.includes(` ${k} `);
  }).slice(0, 40);
}

export function formatMemory(items: MemoryItem[], names: Map<string, string>): string {
  if (!items.length) return '';
  const show = (v: unknown): string => {
    if (!v || typeof v !== 'object') return String(v);
    const o = v as Record<string, unknown>;
    for (const k of ['account_id', 'category_id', 'course_id']) if (typeof o[k] === 'string') return names.get(o[k] as string) ?? String(o[k]);
    if (typeof o.text === 'string') return o.text;
    return JSON.stringify(o);
  };
  return ['MEMORI:', ...items.map((m) => `- ${m.kind} "${m.key}" → ${show(m.value)}`)].join('\n');
}

/* ---------------- pemuat data ---------------- */

export async function loadContextData(db: SupabaseClient, now: Date, today: string): Promise<ContextData> {
  const monthStart = `${today.slice(0, 7)}-01`;
  const q = <T>(p: PromiseLike<{ data: T[] | null }>) => p.then((r) => r.data ?? []);
  const [accounts, categories, sem, courses, projects, monthTx, bills, tasks, targets, settings, vocabDue, reviews, calSrc] = await Promise.all([
    q(db.from('accounts').select('id,name,type,aliases,balance').eq('is_archived', false).order('sort_order')),
    q(db.from('categories').select('id,name,kind,monthly_budget,is_hidden').order('sort_order')),
    db.from('semesters').select('id').eq('is_active', true).maybeSingle().then((r) => r.data),
    q(db.from('courses').select('id,name,alias,code,semester_id')),
    q(db.from('research_projects').select('id,title,status')),
    q(db.from('transactions').select('category_id,amount').eq('kind', 'expense').gte('occurred_at', zonedToIso(monthStart))),
    q(db.from('bills').select('name,amount,next_due_date').eq('is_active', true).lte('next_due_date', addDays(today, 7)).order('next_due_date')),
    q(db.from('tasks').select('title,due_at,course_id,kind').neq('status', 'done').not('due_at', 'is', null).lt('due_at', zonedToIso(addDays(today, 15))).order('due_at')),
    q(db.from('research_targets').select('title,progress,last_touched_at,due_date')),
    q(db.from('settings').select('key,value').in('key', ['english_mode'])),
    db.from('vocab').select('id', { count: 'exact', head: true }).lte('due_at', now.toISOString()).then((r) => r.count ?? 0),
    q(db.from('vocab_reviews').select('created_at').gte('created_at', zonedToIso(addDays(today, -60)))),
    loadCalendarSources(db),
  ]);
  const monthSpend: Record<string, number> = {};
  for (const t of monthTx as { category_id: string | null; amount: number }[]) if (t.category_id) monthSpend[t.category_id] = (monthSpend[t.category_id] ?? 0) + t.amount;
  const courseName = new Map((courses as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const items = buildCalendarItems(calSrc, today, addDays(today, 1));
  const classes = (d: string) => (items.get(d) ?? []).filter((i) => i.type === 'kelas').map((i) => ({ course: i.title, start: i.time ?? '', end: i.endTime ?? '', location: i.subtitle ?? null }));
  const days = new Set((reviews as { created_at: string }[]).map((r) => zonedParts(r.created_at).date));
  let streak = 0;
  for (let d = days.has(today) ? today : addDays(today, -1); days.has(d); d = addDays(d, -1)) streak++;
  const activeCourses = (courses as { semester_id: string | null }[]).filter((c) => !sem || c.semester_id === sem.id);
  return {
    now, today,
    accounts: accounts as ContextData['accounts'],
    categories: categories as ContextData['categories'],
    courses: (activeCourses.length ? activeCourses : courses) as ContextData['courses'],
    projects: projects as ContextData['projects'],
    monthSpend,
    bills: bills as ContextData['bills'],
    classesToday: classes(today), classesTomorrow: classes(addDays(today, 1)),
    tasks: (tasks as { title: string; due_at: string; course_id: string | null; kind: string }[]).map((t) => ({ title: t.title, due_at: t.due_at, kind: t.kind, course: t.course_id ? courseName.get(t.course_id) ?? null : null })),
    targets: targets as ContextData['targets'],
    vocabDue: vocabDue as number,
    studyStreak: streak,
    englishMode: (settings as { key: string; value: unknown }[]).some((s) => s.key === 'english_mode' && s.value === true),
  };
}

async function loadCalendarSources(db: SupabaseClient): Promise<CalendarSources> {
  const q = (t: string, cols: string) => db.from(t).select(cols).then((r) => (r.data ?? []) as never[]);
  const [semesters, courses, schedules, holidays, events] = await Promise.all([
    q('semesters', 'id,name,number,start_date,end_date,is_active'), q('courses', 'id,semester_id,name,alias,lecturer,credits'),
    q('course_schedules', 'id,course_id,weekday,start_time,end_time,location'), q('holidays', 'id,name,start_date,end_date'),
    q('events', 'id,title,start_at,end_at,is_all_day,location,recurrence,recurrence_until'),
  ]);
  return { semesters, courses, schedules, holidays, events, tasks: [], slots: [], targets: [], supervisions: [], bills: [], sinking: [] };
}

export async function loadMemory(db: SupabaseClient): Promise<MemoryItem[]> {
  const { data } = await db.from('agent_memory').select('id,kind,key,value').order('last_used_at', { ascending: false, nullsFirst: false }).limit(200);
  return (data ?? []) as MemoryItem[];
}
