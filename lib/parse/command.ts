// Mengubah kalimat bebas menjadi usulan aksi atau pertanyaan (pengurai lokal, D-32).
// Ra (Gemini) menggantikan sebagian besar logika ini di fase agen. Pengurai ini tetap jadi cadangan saat Gemini gagal.
import { addDays } from '../time';
import {
  cap, findAmount, findFee, findNamed, parseDate, pullTime, removeHits, tidy, WEEKDAY_RX, WEEKDAYS, type NamedItem,
} from './core';

export type ParseContext = {
  accounts: { id: string; name: string; aliases: string[]; type: string }[];
  categories: { id: string; kind: 'expense' | 'income'; name: string; keywords: string[]; slug: string | null; is_hidden: boolean }[];
  courses: { id: string; name: string; alias: string | null }[];
  lastAccountId?: string | null;
};

export type TxProposal = {
  type: 'transaction'; kind: 'expense' | 'income' | 'transfer'; amount: number; date: string;
  account_id: string | null; to_account_id: string | null; category_id: string | null; note: string; fee: number;
  guessedAccount: boolean; guessedCategory: boolean;
};
export type TaskProposal = {
  type: 'task'; title: string; kind: 'assignment' | 'exam' | 'quiz' | 'practicum'; course_id: string | null;
  due_date: string | null; due_time: string; work_date: string | null; work_start: string | null; guessedTime: boolean;
};
export type EventProposal = {
  type: 'event'; title: string; date: string; start_time: string | null; end_time: string | null; end_date: string | null;
  location: string | null; recurrence: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'; recurrence_until: string | null;
};
export type IdeaProposal = { type: 'idea'; content: string };
export type NeedProposal = { type: 'need'; item: string; kind: string | null };
export type Proposal = TxProposal | TaskProposal | EventProposal | IdeaProposal | NeedProposal;

export type Period = { from: string; to: string; label: string };
export type Question =
  | { topic: 'balance'; accountIds: string[] }
  | { topic: 'spending' | 'income'; period: Period; categoryId: string | null }
  | { topic: 'tasks'; period: Period | null }
  | { topic: 'bills' };

export type ParseResult = { kind: 'proposals'; items: Proposal[] } | { kind: 'question'; question: Question } | { kind: 'unknown' };

const accountItems = (ctx: ParseContext): (NamedItem & { type: string })[] =>
  ctx.accounts.map((a) => ({ id: a.id, type: a.type, names: [a.name, ...a.aliases] }));
const courseItems = (ctx: ParseContext): NamedItem[] =>
  ctx.courses.map((c) => ({ id: c.id, names: [c.name, ...(c.alias ? c.alias.split(',') : [])] }));

function matchCategory(text: string, kind: 'expense' | 'income', ctx: ParseContext): string | null {
  const low = ` ${text.toLowerCase().split(/[^a-z0-9&]+/).filter(Boolean).join(' ')} `;
  let best: string | null = null;
  let score = 0;
  for (const c of ctx.categories) {
    if (c.kind !== kind || c.is_hidden || c.slug === 'o_admin') continue;
    const words = [...c.keywords, ...c.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3)];
    for (const raw of words) {
      const k = raw.trim().toLowerCase();
      if (k && low.includes(` ${k} `)) {
        const sc = k.length + (k.includes(' ') ? 5 : 0);
        if (sc > score) { score = sc; best = c.id; }
      }
    }
  }
  return best;
}

const otherCategory = (kind: 'expense' | 'income', ctx: ParseContext) =>
  ctx.categories.find((c) => c.slug === (kind === 'income' ? 'i_lain' : 'o_lain'))?.id ?? null;

function cleanNote(text: string): string {
  const s = tidy(text.replace(/\brp\.?(?=\s|$)/gi, ' ').replace(/\b(pakai|pake|via|dengan|terus|lalu|dan)\s*$/i, ''));
  return cap(s);
}

/* ---------------- transaksi ---------------- */

function parseTransaction(text: string, ctx: ParseContext, today: string): TxProposal | null {
  let t = text;
  const fee = findFee(t); t = fee.rest;
  const d = parseDate(t, 'past', today); t = d.rest;
  const a = findAmount(t); t = a.rest;
  if (!a.amount) return null;
  const lower = t.toLowerCase();
  const accs = accountItems(ctx);
  const hits = findNamed(t, accs);
  const isIn = /\b(gaji|honor|terima|diterima|dapat|pemasukan|uang saku|kiriman|dikirim|beasiswa|bonus|dividen|cashback|transfer\s+masuk|masuk)\b/.test(lower);
  const isTf = /\b(tarik|setor|pindah|pindahin|top\s*up|topup|isi\s*saldo|transfer\s+(dari|ke))\b/.test(lower) && !/transfer\s+masuk/.test(lower);
  const date = d.date ?? today;

  if (isTf) {
    let from: string | null = null;
    let to: string | null = null;
    for (const h of hits) {
      const before = lower.slice(0, h.idx).trimEnd();
      if (/(^|\s)dari$/.test(before) && !from) from = h.item.id;
      else if (/(^|\s)(ke|kedalam)$/.test(before) && !to) to = h.item.id;
    }
    const cash = ctx.accounts.find((x) => x.type === 'cash')?.id ?? null;
    const ids = hits.map((h) => h.item.id);
    if (/\btarik\b/.test(lower)) { to ??= cash; from ??= ids.find((x) => x !== to) ?? null; }
    else if (/\bsetor\b/.test(lower)) { from ??= cash; to ??= ids.find((x) => x !== from) ?? null; }
    else {
      const rest = ids.filter((x) => x !== from && x !== to);
      from ??= rest.shift() ?? null;
      to ??= rest.shift() ?? null;
    }
    const guessed = !from;
    if (!from && ctx.lastAccountId && ctx.lastAccountId !== to) from = ctx.lastAccountId;
    const verb = lower.match(/\b(tarik\s*tunai|setor\s*tunai|top\s*up|topup|pindah\w*|isi\s*saldo)\b/);
    let note = cleanNote(removeHits(t, hits));
    if (!note || /^(tarik|setor|top|pindah|isi)/i.test(note)) note = verb ? cap(verb[0].replace(/\s+/g, ' ')) : 'Transfer';
    return { type: 'transaction', kind: 'transfer', amount: a.amount, date, account_id: from, to_account_id: to, category_id: null, note, fee: fee.fee, guessedAccount: guessed, guessedCategory: false };
  }

  const kind = isIn ? 'income' : 'expense';
  const matched = matchCategory(t, kind, ctx);
  const account = hits[0]?.item.id ?? ctx.lastAccountId ?? ctx.accounts[0]?.id ?? null;
  return {
    type: 'transaction', kind, amount: a.amount, date, account_id: account, to_account_id: null,
    category_id: matched ?? otherCategory(kind, ctx), note: cleanNote(removeHits(t, hits)), fee: 0,
    guessedAccount: !hits.length, guessedCategory: !matched,
  };
}

/* ---------------- tugas ---------------- */

function parseTask(text: string, ctx: ParseContext, today: string): TaskProposal {
  let t = text.trim();
  let kind: TaskProposal['kind'] = 'assignment';
  const km = t.match(/^(tambah\s+)?(tugas|ujian|uts|uas|kuis|quiz|praktikum)\b[:\s]*/i);
  if (km) {
    const w = km[2].toLowerCase();
    kind = ['ujian', 'uts', 'uas'].includes(w) ? 'exam' : w === 'kuis' || w === 'quiz' ? 'quiz' : w === 'praktikum' ? 'practicum' : 'assignment';
    t = (['uts', 'uas'].includes(w) ? `${w.toUpperCase()} ` : '') + t.slice(km[0].length);
  }
  let work: string | null = null;
  let workStart: string | null = null;
  const wm = t.match(new RegExp(`\\b(?:dikerjakan|kerjakan|kerja|garap)\\s+((?:hari\\s*ini|besok|lusa|${WEEKDAY_RX}|malam\\s+ini|nanti\\s+malam)(?:\\s+depan)?)(?:\\s+jam\\s*(\\d{1,2})(?:[.:](\\d{2}))?)?`, 'i'));
  if (wm) {
    const phrase = wm[1].toLowerCase();
    work = /malam/.test(phrase) ? today : parseDate(wm[1], 'future', today).date;
    if (wm[2] !== undefined && Number(wm[2]) < 24) workStart = `${String(Number(wm[2])).padStart(2, '0')}:${wm[3] ?? '00'}`;
    else if (/malam/.test(phrase)) workStart = '19:00';
    t = t.replace(wm[0], ' ');
  }
  const tm = pullTime(t); t = tm.rest;
  const d = parseDate(t, 'future', today); t = d.rest;
  t = t.replace(/\b(deadline|dedlen|dikumpul(?:kan)?|kumpul|batas|tenggat|due)\b/gi, ' ');
  const hits = findNamed(t, courseItems(ctx));
  const course = hits.sort((a, b) => b.len - a.len)[0] ?? null;
  if (course) t = `${t.slice(0, course.idx)} ${t.slice(course.idx + course.len)}`;
  t = tidy(t);
  const label = { assignment: 'Tugas', exam: 'Ujian', quiz: 'Kuis', practicum: 'Praktikum' }[kind];
  const courseName = course ? ctx.courses.find((c) => c.id === course.item.id)?.name : null;
  return {
    type: 'task', kind, title: t ? cap(t) : courseName ? `${label} ${courseName}` : `${label} baru`,
    course_id: course?.item.id ?? null, due_date: d.date, due_time: tm.start ?? '23:59', work_date: work, work_start: workStart,
    guessedTime: !!tm.start && /malem|malam/i.test(text) && tm.start === '23:59',
  };
}

/* ---------------- acara ---------------- */

function parseEvent(text: string, lead: string, today: string): EventProposal {
  let r = text;
  let recurrence: EventProposal['recurrence'] = 'none';
  let weekday = -1;
  let m = r.match(new RegExp(`\\b(?:tiap|setiap|per)\\s+(?:hari\\s+)?(${WEEKDAY_RX})\\b`, 'i'));
  if (m) { recurrence = 'weekly'; weekday = WEEKDAYS[m[1].toLowerCase().replace("jum'at", 'jumat')]; r = r.replace(m[0], ' '); }
  else if ((m = r.match(/\b(?:tiap|setiap|per)\s*(hari|minggu|pekan|bulan|tahun)\b/i))) {
    recurrence = ({ hari: 'daily', minggu: 'weekly', pekan: 'weekly', bulan: 'monthly', tahun: 'yearly' } as const)[m[1].toLowerCase() as 'hari'];
    r = r.replace(m[0], ' ');
  }
  const tm = pullTime(r); r = tm.rest;
  let endDate: string | null = null;
  let until: string | null = null;
  const em = r.match(/\b(?:sampai|s\/d|hingga)\s+(.+)$/i);
  if (em) {
    const ed = parseDate(em[1], 'future', today).date;
    if (ed) { if (recurrence !== 'none') until = ed; else endDate = ed; r = r.replace(em[0], ' '); }
  }
  const d = parseDate(r, 'future', today); r = d.rest;
  let date = d.date;
  if (!date && weekday > 0) {
    const cur = Number(new Date(`${today}T12:00:00Z`).getUTCDay() || 7);
    let diff = weekday - cur; if (diff < 0) diff += 7;
    date = addDays(today, diff);
  }
  let location: string | null = null;
  const pm = r.match(/\b(?:di|lokasi|tempat|ruang)\s+(.+)$/i);
  if (pm) { location = tidy(pm[1]); r = r.replace(pm[0], ' '); }
  let title = tidy(r.replace(/\b(pada|tanggal|hari|nanti)\b/gi, ' '));
  if (['rapat', 'meeting'].includes(lead)) title = tidy(`${cap(lead)} ${title}`);
  else if (lead.startsWith('janji')) title = tidy(`Janji ${title}`);
  return { type: 'event', title: cap(title) || 'Acara', date: date ?? today, start_time: tm.start, end_time: tm.end, end_date: endDate, location: location ? cap(location) : null, recurrence, recurrence_until: until };
}

/* ---------------- pertanyaan ---------------- */

function periodOf(low: string, today: string): Period {
  const ym = today.slice(0, 7);
  const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const [y, m] = ym.split('-').map(Number);
  if (/hari ini/.test(low)) return { from: today, to: today, label: 'hari ini' };
  if (/kemarin/.test(low)) { const k = addDays(today, -1); return { from: k, to: k, label: 'kemarin' }; }
  if (/minggu ini/.test(low)) {
    const wd = Number(new Date(`${today}T12:00:00Z`).getUTCDay() || 7);
    const s = addDays(today, 1 - wd);
    return { from: s, to: addDays(s, 6), label: 'minggu ini' };
  }
  if (/bulan lalu/.test(low)) {
    const py = m === 1 ? y - 1 : y; const pm = m === 1 ? 12 : m - 1;
    const p = `${py}-${String(pm).padStart(2, '0')}`;
    return { from: `${p}-01`, to: `${p}-${lastDay(py, pm)}`, label: 'bulan lalu' };
  }
  return { from: `${ym}-01`, to: `${ym}-${lastDay(y, m)}`, label: 'bulan ini' };
}

function parseQuestion(text: string, ctx: ParseContext, today: string): Question | null {
  const low = text.toLowerCase();
  if (/\bsaldo\b|\bsisa uang\b|uang (aku|saya|ku)\b/.test(low)) {
    return { topic: 'balance', accountIds: findNamed(text, accountItems(ctx)).map((h) => h.item.id) };
  }
  if (/(pengeluaran|keluar|belanja|habis|boros|pemasukan|masuk|terima)/.test(low) && !/\btugas\b/.test(low)) {
    const isIn = /(pemasukan|masuk|terima)/.test(low) && !/(pengeluaran|keluar|belanja|habis|boros)/.test(low);
    return { topic: isIn ? 'income' : 'spending', period: periodOf(low, today), categoryId: matchCategory(text, isIn ? 'income' : 'expense', ctx) };
  }
  if (/\btugas\b|deadline|tenggat/.test(low)) {
    const p = /hari ini|besok|minggu ini/.test(low)
      ? (/besok/.test(low) ? { from: addDays(today, 1), to: addDays(today, 1), label: 'besok' } : periodOf(low, today))
      : null;
    return { topic: 'tasks', period: p };
  }
  if (/tagihan/.test(low)) return { topic: 'bills' };
  return null;
}

/* ---------------- pintu masuk ---------------- */

/** Pecah "A, terus B" / "A lalu B" / "A dan juga B" menjadi beberapa perintah. */
export function splitCommands(text: string): string[] {
  // koma di antara angka ("1,5jt") bukan pemisah perintah
  return text.split(/\s*(?:(?:;|,(?!\d))\s*(?:terus|lalu|habis itu|trus)?|\b(?:terus|lalu|habis itu|trus|dan juga)\b)\s*/i)
    .map((s) => s.trim()).filter((s) => s.length > 1);
}

export function parseOne(raw: string, ctx: ParseContext, today: string): Proposal | null {
  const t = raw.trim();
  const low = t.toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^ide\b[:\s-]*/i))) return { type: 'idea', content: cap(tidy(t.slice(m[0].length))) };
  if ((m = t.match(/^(butuh|kebutuhan(?:\s+riset)?)\b[:\s-]*/i))) {
    const rest = t.slice(m[0].length);
    const kw = rest.toLowerCase().match(/\b(data|alat|izin|akses|literatur)\b/);
    return { type: 'need', item: cap(tidy(rest)), kind: kw ? kw[1] : null };
  }
  if (/^(tambah\s+)?(tugas|ujian|uts|uas|kuis|quiz|praktikum)\b/i.test(t)) return parseTask(t, ctx, today);
  const evM = t.match(/^(?:tambah(?:kan)?\s+)?(acara|agenda|rapat|meeting|janji(?:\s+temu)?|kegiatan|event|jadwalkan|ingatkan(?:\s+(?:aku|saya))?(?:\s+untuk)?)\b[:\s]*/i);
  if (evM) return parseEvent(t.slice(evM[0].length), evM[1].toLowerCase(), today);
  const tx = parseTransaction(t, ctx, today);
  if (tx) return tx;
  if (/\b(deadline|dikumpul|tenggat|dedlen)\b/i.test(t)) return parseTask(t, ctx, today);
  const timeish = /\b(?:jam|pukul|pkl)\s*\d/i.test(t) || /\b\d{1,2}[.:]\d{2}\b/.test(t);
  if (timeish && !/^(berapa|apa|cek|lihat)/.test(low)) return parseEvent(t, '', today);
  return null;
}

/** Kalimat utuh: pertanyaan, atau satu sampai beberapa usulan aksi. */
export function parseCommand(text: string, ctx: ParseContext, today: string): ParseResult {
  const t = text.trim();
  if (!t) return { kind: 'unknown' };
  const low = t.toLowerCase();
  const isQ = /\?\s*$/.test(t) || /^(berapa|lihat|cek|apa|daftar|list|sisa|total|tampilkan)\b/.test(low) || /\b(berapa|apa saja)\b/.test(low) || /^saldo\b/.test(low);
  if (isQ) {
    const q = parseQuestion(t, ctx, today);
    return q ? { kind: 'question', question: q } : { kind: 'unknown' };
  }
  const parts = splitCommands(t);
  const items = parts.map((p) => parseOne(p, ctx, today)).filter((p): p is Proposal => !!p);
  if (items.length) return { kind: 'proposals', items };
  const q = parseQuestion(t, ctx, today);
  return q ? { kind: 'question', question: q } : { kind: 'unknown' };
}

