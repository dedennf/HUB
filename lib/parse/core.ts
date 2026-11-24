// Pengurai lokal (port dari app lama, D-32). Fungsi murni: tanggal relatif, nominal, pencocokan nama.
// "today" selalu dikirim dari luar (tanggal WIB), supaya hasil tidak bergantung jam perangkat atau server.
import { addDays, isIsoDate, isoWeekday } from '../time';

export const MONTHS: Record<string, number> = {
  jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, maret: 3, apr: 4, april: 4, mei: 5, jun: 6, juni: 6, jul: 7, juli: 7,
  agu: 8, agt: 8, agustus: 8, sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, nov: 11, november: 11, des: 12, desember: 12,
};
export const WEEKDAYS: Record<string, number> = { senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, "jum'at": 5, sabtu: 6, minggu: 7, ahad: 7 };
const MONTH_RX = 'januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agu|agt|sept|sep|okt|nov|des';
export const WEEKDAY_RX = "senin|selasa|rabu|kamis|jum'?at|sabtu|minggu|ahad";

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const valid = (y: number, m: number, d: number) => (isIsoDate(ymd(y, m, d)) ? ymd(y, m, d) : null);
export const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '').trim();
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export type DateMode = 'past' | 'future';

/** Cari tanggal di teks. 'past' untuk transaksi ("senin" = senin lalu), 'future' untuk tenggat dan acara. */
export function parseDate(text: string, mode: DateMode, today: string): { date: string | null; rest: string } {
  let t = text;
  let date: string | null = null;
  const [ty, tm] = today.split('-').map(Number);
  const cut = (re: RegExp, fn: (m: RegExpMatchArray) => string | null) => {
    if (date !== null) return;
    const m = t.match(re);
    if (!m) return;
    const d = fn(m);
    if (d) { date = d; t = t.replace(m[0], ' '); }
  };
  const adjustYear = (m: number, d: number) => {
    const r = valid(ty, m, d);
    if (!r) return null;
    if (mode === 'future' && r < today) return valid(ty + 1, m, d);
    if (mode === 'past' && r > today) return valid(ty - 1, m, d);
    return r;
  };
  cut(/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => valid(+m[1], +m[2], +m[3]));
  cut(/\b(\d+)\s*hari\s*(?:yang\s*)?lalu\b/i, (m) => addDays(today, -Number(m[1])));
  cut(/\bkemarin\s*lusa\b/i, () => addDays(today, -2));
  cut(/\bkemarin\b/i, () => addDays(today, -1));
  cut(/\b(?:hari\s*ini|tadi(?:\s+(?:pagi|siang|sore|malam))?|barusan)\b/i, () => today);
  cut(/\bbesok\b/i, () => addDays(today, 1));
  cut(/\blusa\b/i, () => addDays(today, 2));
  cut(/\bminggu\s*depan\b/i, () => addDays(today, 7));
  cut(new RegExp(`\\b(\\d{1,2})\\s*(${MONTH_RX})\\b`, 'i'), (m) => adjustYear(MONTHS[m[2].toLowerCase()], Number(m[1])));
  cut(/\b(?:tanggal|tgl)\s*(\d{1,2})\b/i, (m) => {
    const d = Number(m[1]);
    const r = valid(ty, tm, d);
    if (!r) return null;
    if (mode === 'future' && r < today) return tm === 12 ? valid(ty + 1, 1, d) : valid(ty, tm + 1, d);
    if (mode === 'past' && r > today) return tm === 1 ? valid(ty - 1, 12, d) : valid(ty, tm - 1, d);
    return r;
  });
  cut(/\b(\d{1,2})[/-](\d{1,2})\b/, (m) => adjustYear(Number(m[2]), Number(m[1])));
  cut(new RegExp(`\\b(${WEEKDAY_RX})(\\s+depan)?\\b`, 'i'), (m) => {
    const target = WEEKDAYS[m[1].toLowerCase().replace("jum'at", 'jumat')] ?? WEEKDAYS.jumat;
    const cur = isoWeekday(today);
    if (m[2]) return addDays(today, 7 - cur + target);
    if (mode === 'past') { let diff = cur - target; if (diff <= 0) diff += 7; return addDays(today, -diff); }
    let diff = target - cur; if (diff <= 0) diff += 7; return addDays(today, diff);
  });
  return { date, rest: t };
}

/** "jam 14", "pukul 08.30", "13.50-15.00", "jam 9 sampai jam 11" */
export function pullTime(text: string): { start: string | null; end: string | null; rest: string } {
  let m = text.match(/\b(?:jam|pukul|pkl)\s*(\d{1,2})(?:[.:](\d{2}))?(?:\s*(?:-|sampai|s\/d|hingga)\s*(?:jam\s*)?(\d{1,2})(?:[.:](\d{2}))?)?/i);
  if (!m) m = text.match(/\b(\d{1,2})[.:](\d{2})(?:\s*(?:-|sampai|s\/d|hingga)\s*(\d{1,2})[.:](\d{2}))?\b/);
  if (!m) return { start: null, end: null, rest: text };
  let h = Number(m[1]);
  const at = (m.index ?? 0) + m[0].length;
  // "jam 12 malem" = 23.59 (kebiasaan tenggat), "jam 7 malam" = 19.00
  const malam = text.slice(at).match(/^\s*(malem|malam)\b/i);
  const rest = `${text.slice(0, m.index)} ${text.slice(at + (malam ? malam[0].length : 0))}`;
  if (malam) {
    if (h === 12) return { start: '23:59', end: null, rest };
    if (h < 12) h += 12;
  }
  if (h > 23) return { start: null, end: null, rest: text };
  const start = `${pad(h)}:${m[2] ?? '00'}`;
  const end = m[3] && Number(m[3]) < 24 ? `${pad(Number(m[3]))}:${m[4] ?? '00'}` : null;
  return { start, end, rest };
}

function normNum(raw: string, unit?: string): number {
  let s = raw;
  const u = (unit ?? '').toLowerCase();
  const mult = ['k', 'rb', 'ribu'].includes(u) ? 1e3 : ['jt', 'juta'].includes(u) ? 1e6 : 1;
  if (mult > 1) {
    s = /^\d+[.,]\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/[.,]/g, '');
    return Math.round(Number(s) * mult);
  }
  return Number(s.replace(/[.,]/g, ''));
}

const SLANG: Record<string, number> = { cepek: 100, gopek: 500, seceng: 1000, goceng: 5000, ceban: 10000, goban: 50000 };

/** Nominal pertama yang meyakinkan: punya satuan, diawali Rp, atau ≥ 1.000. Juga "goceng", "ceban". */
export function findAmount(text: string): { amount: number; rest: string } {
  const re = /(rp\.?\s*)?(\d+(?:[.,]\d+)*)\s*(juta|jt|ribu|rb|k)?(?![a-z0-9])/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const val = normNum(m[2], m[3]);
    if ((m[3] || m[1] || val >= 1000) && val > 0) return { amount: val, rest: `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}` };
  }
  const s = text.match(new RegExp(`\\b(${Object.keys(SLANG).join('|')})\\b`, 'i'));
  if (s) return { amount: SLANG[s[1].toLowerCase()], rest: text.replace(s[0], ' ') };
  return { amount: 0, rest: text };
}

/** "biaya admin 2.500", "admin 6500" */
export function findFee(text: string): { fee: number; rest: string } {
  const m = text.match(/\b(?:biaya\s*admin|admin|fee)\s*(?:rp\.?\s*)?(\d+(?:[.,]\d+)*)\s*(juta|jt|ribu|rb|k)?(?![a-z0-9])/i);
  if (!m) return { fee: 0, rest: text };
  return { fee: normNum(m[1], m[2]), rest: text.replace(m[0], ' ') };
}

export type NamedItem = { id: string; names: string[] };

/** Semua kemunculan nama (atau alias) dalam teks, urut posisi. Nama terpanjang menang per item. */
export function findNamed<T extends NamedItem>(text: string, items: T[]): { item: T; idx: number; len: number }[] {
  const lower = text.toLowerCase();
  const hits: { item: T; idx: number; len: number }[] = [];
  for (const it of items) {
    const names = it.names.map((n) => n.trim().toLowerCase()).filter(Boolean).sort((a, b) => b.length - a.length);
    for (const n of names) {
      const m = new RegExp(`(^|[^a-z0-9])(${reEsc(n)})(?=$|[^a-z0-9])`).exec(lower);
      if (m) { hits.push({ item: it, idx: m.index + m[1].length, len: n.length }); break; }
    }
  }
  return hits.sort((a, b) => a.idx - b.idx);
}

/** Hapus bagian teks pada posisi hits (dari belakang), beserta kata penghubung sebelumnya. */
export function removeHits(text: string, hits: { idx: number; len: number }[]): string {
  let s = text;
  for (const h of [...hits].sort((a, b) => b.idx - a.idx)) {
    const pre = s.slice(0, h.idx).replace(/\b(pakai|pake|via|dengan|dari|ke|kedalam|di)\s*$/i, '');
    s = `${pre} ${s.slice(h.idx + h.len)}`;
  }
  return s;
}
